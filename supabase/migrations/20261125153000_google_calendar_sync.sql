-- Google Calendar one-way sync (Issue #29).
-- Additive; not applied to any remote database.
--
-- Ordem: posterior a 20261125130000_table_privileges_matrix.sql (PR #123), cujo
-- bloco condicional já reconhece `public.calendar_connections`. As três tabelas
-- abaixo são exclusivas do servidor (service_role): RLS ligada, nenhuma policy
-- de cliente e REVOKE explícito para neutralizar os default privileges que o
-- Supabase concede a anon/authenticated em objetos novos de `public`.

-- ---------------------------------------------------------------------------
-- Conexões OAuth por prestador (tokens cifrados AES-256-GCM pela aplicação).
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  refresh_token_ciphertext text,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  granted_scope text not null default '',
  connection_status text not null default 'pending'
    check (connection_status in ('pending','connected','suspended')),
  -- Motivo operacional da suspensão (ex.: invalid_grant, disconnect_requested).
  suspended_reason text,
  -- State OAuth: só o hash é persistido, preso ao usuário que iniciou o fluxo.
  oauth_state_hash text,
  oauth_state_expires_at timestamptz,
  oauth_state_user_id uuid,
  connected_at timestamptz,
  -- Desconexão em andamento: tokens são mantidos até todos os eventos
  -- mapeados serem removidos do Google (ou marcados como órfãos).
  disconnect_requested_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint calendar_connections_state_complete check (
    (oauth_state_hash is null and oauth_state_expires_at is null and oauth_state_user_id is null)
    or (oauth_state_hash is not null and oauth_state_expires_at is not null and oauth_state_user_id is not null)
  ),
  constraint calendar_connections_disconnect_suspended check (
    disconnect_requested_at is null or connection_status = 'suspended'
  )
);

create unique index calendar_connections_state_hash_key
  on public.calendar_connections (oauth_state_hash)
  where oauth_state_hash is not null;

create index calendar_connections_disconnecting_idx
  on public.calendar_connections (disconnect_requested_at)
  where disconnect_requested_at is not null;

-- ---------------------------------------------------------------------------
-- Outbox transacional alimentada por booking_events.
-- ---------------------------------------------------------------------------
create table public.calendar_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- Nulo só para jobs de reenvio (backfill) criados ao conectar: eles não
  -- correspondem a um evento da reserva e não poluem booking_events.
  booking_event_id uuid references public.booking_events(id) on delete cascade,
  reason text not null default 'booking_event'
    check (reason in ('booking_event','backfill')),
  operation text not null check (operation in ('upsert','delete')),
  -- dead = estado terminal após esgotar tentativas ou erro permanente.
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  -- clock_timestamp() ordena jobs da mesma reserva mesmo dentro de uma transação.
  created_at timestamptz not null default clock_timestamp(),
  unique (booking_event_id),
  constraint calendar_sync_outbox_reason_event check (
    (reason = 'booking_event') = (booking_event_id is not null)
  )
);

create index calendar_sync_outbox_ready_idx
  on public.calendar_sync_outbox (available_at, created_at)
  where status in ('pending','failed','processing');

create index calendar_sync_outbox_booking_head_idx
  on public.calendar_sync_outbox (booking_id, created_at, id)
  where status in ('pending','failed','processing');

-- ---------------------------------------------------------------------------
-- Vínculo reserva -> evento do Google.
-- ---------------------------------------------------------------------------
create table public.booking_calendar_events (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  calendar_id text not null,
  google_event_id text not null,
  -- Preenchido quando o evento não pôde ser removido do Google (ex.: token
  -- revogado durante a desconexão). O vínculo é mantido como rastro.
  orphaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, google_event_id)
);

create index booking_calendar_events_provider_idx
  on public.booking_calendar_events (provider_id);

alter table public.calendar_connections enable row level security;
alter table public.calendar_sync_outbox enable row level security;
alter table public.booking_calendar_events enable row level security;

-- No client policies: these tables are server/service-role only.
revoke all on table public.calendar_connections from public, anon, authenticated;
revoke all on table public.calendar_sync_outbox from public, anon, authenticated;
revoke all on table public.booking_calendar_events from public, anon, authenticated;
grant all on table public.calendar_connections to service_role;
grant all on table public.calendar_sync_outbox to service_role;
grant all on table public.booking_calendar_events to service_role;

-- ---------------------------------------------------------------------------
-- Trigger: booking_events -> outbox (mesma transação do evento).
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_calendar_sync_from_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text;
begin
  if new.event_type = 'booking.confirmed' then
    v_operation := 'upsert';
  elsif new.event_type in ('booking.cancelled', 'booking.expired') then
    v_operation := 'delete';
  else
    return new;
  end if;

  insert into public.calendar_sync_outbox (
    booking_id, booking_event_id, operation
  ) values (
    new.booking_id, new.id, v_operation
  ) on conflict (booking_event_id) do nothing;

  return new;
end;
$$;

-- Função de trigger: ninguém precisa chamá-la diretamente (o disparo do trigger
-- não exige EXECUTE de quem insere o booking_event).
revoke all on function public.enqueue_calendar_sync_from_booking_event() from public, anon, authenticated, service_role;

create trigger booking_events_calendar_outbox
  after insert on public.booking_events
  for each row execute function public.enqueue_calendar_sync_from_booking_event();

-- ---------------------------------------------------------------------------
-- Reenvio ao conectar (backfill): na transição para `connected` (primeira
-- conexão ou reconexão após suspensão), enfileira na mesma transação:
-- - reservas confirmadas do prestador que ainda não terminaram;
-- - reservas não confirmadas que ainda têm evento ativo no Google (ex.:
--   canceladas enquanto a conexão estava suspensa e cujo job virou dead).
-- O worker decide pelo estado atual da reserva, então duplicatas são
-- inofensivas; mesmo assim pula reservas que já têm job `pending`. Limite de
-- 500 reservas por conexão, das mais próximas para as mais distantes.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_calendar_backfill_on_connect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.connection_status <> 'connected' or new.disconnect_requested_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.connection_status = 'connected' then
    return new;
  end if;

  insert into public.calendar_sync_outbox (booking_id, booking_event_id, reason, operation)
  select
    b.id,
    null,
    'backfill',
    case when b.status = 'confirmed' then 'upsert' else 'delete' end
  from public.bookings b
  where b.provider_id = new.provider_id
    and (
      (b.status = 'confirmed' and b.ends_at > now())
      or (
        b.status <> 'confirmed'
        and exists (
          select 1 from public.booking_calendar_events m
          where m.booking_id = b.id
            and m.provider_id = new.provider_id
            and m.orphaned_at is null
        )
      )
    )
    and not exists (
      select 1 from public.calendar_sync_outbox o
      where o.booking_id = b.id and o.status = 'pending'
    )
  order by b.starts_at, b.id
  limit 500;

  return new;
end;
$$;

revoke all on function public.enqueue_calendar_backfill_on_connect() from public, anon, authenticated, service_role;

create trigger calendar_connections_backfill_on_connect
  after insert or update of connection_status on public.calendar_connections
  for each row execute function public.enqueue_calendar_backfill_on_connect();

-- ---------------------------------------------------------------------------
-- Claim: no máximo um job por reserva, sempre o mais antigo não terminal.
-- Reservas cujo job mais antigo ainda está em processing (não vencido) são
-- ignoradas, então confirmação e cancelamento nunca correm juntos ou
-- invertidos. Jobs presos em processing após a última tentativa viram dead.
-- O limite de 8 tentativas espelha CALENDAR_MAX_ATTEMPTS no worker.
-- ---------------------------------------------------------------------------
create or replace function public.claim_calendar_sync_jobs(p_limit integer default 10)
returns setof public.calendar_sync_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25));
begin
  update public.calendar_sync_outbox o
  set status = 'dead',
      completed_at = now(),
      processing_started_at = null,
      last_error_code = coalesce(o.last_error_code, 'worker_timeout_max_attempts')
  where o.attempts >= 8
    and (
      o.status = 'failed'
      or (o.status = 'processing' and o.processing_started_at < now() - interval '10 minutes')
    );

  return query
  with heads as (
    select distinct on (h.booking_id) h.id
    from public.calendar_sync_outbox h
    where h.status in ('pending','failed','processing')
    order by h.booking_id, h.created_at, h.id
  ), selected as (
    select o.id
    from public.calendar_sync_outbox o
    join heads on heads.id = o.id
    where (
        o.status in ('pending','failed')
        or (o.status = 'processing' and o.processing_started_at < now() - interval '10 minutes')
      )
      and o.available_at <= now()
      and o.attempts < 8
    order by o.available_at, o.created_at, o.id
    for update of o skip locked
    limit v_limit
  )
  update public.calendar_sync_outbox o
  set status = 'processing',
      attempts = o.attempts + 1,
      processing_started_at = now(),
      last_error_code = null
  from selected
  where o.id = selected.id
  returning o.*;
end;
$$;

revoke all on function public.claim_calendar_sync_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_calendar_sync_jobs(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Consumo atômico do state OAuth. O state é sempre queimado quando encontrado
-- (inclusive vencido ou de outro usuário), impedindo replay e corrida entre
-- callbacks simultâneos: o segundo bloqueia no FOR UPDATE e não encontra mais
-- o hash.
-- ---------------------------------------------------------------------------
create or replace function public.consume_calendar_oauth_state(
  p_state_hash text,
  p_user_id uuid
)
returns table (connection_provider_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
  v_user uuid;
  v_expires timestamptz;
  v_disconnecting timestamptz;
begin
  if p_state_hash is null or p_user_id is null then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  select c.provider_id, c.oauth_state_user_id, c.oauth_state_expires_at, c.disconnect_requested_at
    into v_provider, v_user, v_expires, v_disconnecting
  from public.calendar_connections c
  where c.oauth_state_hash = p_state_hash
  for update;

  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;

  update public.calendar_connections c
  set oauth_state_hash = null,
      oauth_state_expires_at = null,
      oauth_state_user_id = null,
      updated_at = now()
  where c.provider_id = v_provider;

  if v_expires is null or v_expires <= now() then
    return query select null::uuid, 'expired'::text;
  elsif v_user is distinct from p_user_id then
    return query select null::uuid, 'forbidden'::text;
  elsif v_disconnecting is not null then
    return query select null::uuid, 'disconnecting'::text;
  else
    return query select v_provider, 'ok'::text;
  end if;
end;
$$;

revoke all on function public.consume_calendar_oauth_state(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_calendar_oauth_state(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Finalização da desconexão: só apaga a conexão (e os tokens) quando não há
-- mais vínculo ativo nem job em processing do prestador. Devolve o refresh
-- token cifrado para revogação best-effort depois do commit.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_calendar_disconnect(p_provider_id uuid)
returns table (finalized boolean, revoke_token_ciphertext text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciphertext text;
begin
  perform 1
  from public.calendar_connections c
  where c.provider_id = p_provider_id
    and c.disconnect_requested_at is not null
  for update;

  if not found then
    return query select false, null::text;
    return;
  end if;

  if exists (
    select 1 from public.booking_calendar_events m
    where m.provider_id = p_provider_id and m.orphaned_at is null
  ) or exists (
    select 1
    from public.calendar_sync_outbox o
    join public.bookings b on b.id = o.booking_id
    where b.provider_id = p_provider_id
      and o.status = 'processing'
      and o.processing_started_at >= now() - interval '10 minutes'
  ) then
    return query select false, null::text;
    return;
  end if;

  delete from public.calendar_connections c
  where c.provider_id = p_provider_id
  returning c.refresh_token_ciphertext into v_ciphertext;

  return query select true, v_ciphertext;
end;
$$;

revoke all on function public.finalize_calendar_disconnect(uuid) from public, anon, authenticated;
grant execute on function public.finalize_calendar_disconnect(uuid) to service_role;
