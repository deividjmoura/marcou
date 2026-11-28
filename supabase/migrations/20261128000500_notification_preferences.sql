-- Preferências de notificação por usuário, evento e canal (Issue #13).
--
-- Padrão documentado quando não existe registro para (user_id, event_type, channel):
--   - canal 'in_app': ligado (true) por padrão.
--   - canal 'email':  desligado (false) por padrão até haver provedor configurado (#26).
--
-- Eventos obrigatórios no canal 'in_app' ('booking.cancelled' e 'booking.changed')
-- não podem ser silenciados: a restrição é garantida na tabela (CHECK) e também
-- na função de avaliação `public.is_notification_enabled()`.

create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  channel text not null,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type, channel),
  constraint notification_preferences_event_type_check check (
    event_type in (
      'booking.created',
      'booking.proof_received',
      'booking.confirmed',
      'booking.cancelled',
      'booking.expired',
      'booking.reminder',
      'booking.changed'
    )
  ),
  constraint notification_preferences_channel_check check (
    channel in ('in_app', 'email')
  ),
  constraint notification_preferences_mandatory_in_app_check check (
    not (
      channel = 'in_app'
      and event_type in ('booking.cancelled', 'booking.changed')
      and enabled = false
    )
  )
);

create index notification_preferences_user_channel_idx
  on public.notification_preferences (user_id, channel);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences_update_own"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Sem política de DELETE: o usuário alterna enabled=true/false sem remover o
-- registro; exclusão em cascata ocorre apenas ao remover auth.users.
revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to service_role;

comment on table public.notification_preferences is
  'Preferências privadas de notificação por usuário, evento e canal. Padrão: in_app ligado, email desligado. Eventos obrigatórios in_app não podem ser silenciados.';

-- Avalia a preferência efetiva de um destinatário para (event_type, channel).
-- Função interna usada pelo trigger de notificações e pelo gerador de lembretes.
create or replace function public.is_notification_enabled(
  p_user_id uuid,
  p_event_type text,
  p_channel text default 'in_app'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enabled boolean;
begin
  if p_user_id is null or p_event_type is null or p_channel not in ('in_app', 'email') then
    return false;
  end if;

  -- Defesa em profundidade: eventos obrigatórios no aplicativo nunca são silenciados.
  if p_channel = 'in_app' and p_event_type in ('booking.cancelled', 'booking.changed') then
    return true;
  end if;

  select np.enabled
    into v_enabled
    from public.notification_preferences np
   where np.user_id = p_user_id
     and np.event_type = p_event_type
     and np.channel = p_channel;

  if found then
    return v_enabled;
  end if;

  -- Padrão documentado: in_app ligado; email desligado até haver provedor.
  return p_channel = 'in_app';
end;
$$;

revoke all on function public.is_notification_enabled(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.is_notification_enabled(uuid, text, text)
  to service_role;

comment on function public.is_notification_enabled(uuid, text, text) is
  'Resolve a preferência efetiva do usuário para (event_type, channel), preservando eventos obrigatórios in_app e o padrão fail-safe de email desligado.';

-- Respeita as preferências no ponto de emissão in-app sem perder idempotência
-- nem bloquear eventos obrigatórios (booking.cancelled / booking.changed).
create or replace function public.notify_on_booking_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_booking public.bookings;
  v_provider public.providers;
  v_when text;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then
    return null;
  end if;

  select * into v_provider from public.providers where id = v_booking.provider_id;
  if not found then
    return null;
  end if;

  v_when := to_char(
    v_booking.starts_at at time zone v_booking.timezone,
    'DD/MM/YYYY HH24:MI'
  );

  insert into public.notifications
    (recipient_id, kind, title, body, booking_id, event_key)
  select
    payload.recipient_id,
    payload.kind,
    payload.title,
    payload.body,
    v_booking.id,
    new.id::text
  from public.notification_payloads(
    new.event_type, v_booking, v_provider, v_when
  ) as payload
  where public.is_notification_enabled(
    payload.recipient_id,
    new.event_type,
    'in_app'
  )
  on conflict (recipient_id, event_key) do nothing;

  return null;
end;
$$;

revoke all on function public.notify_on_booking_event()
  from public, anon, authenticated;

-- Atualiza o gerador de lembretes para respeitar preferências sem quebrar a
-- serialização (FOR UPDATE OF b SKIP LOCKED) nem a idempotência diária no fuso
-- do prestador (bookings.timezone).
--
-- - Se pelo menos um participante (cliente ou prestador) mantém booking.reminder
--   ativo em in_app, o evento é inserido com chave `reminder-<id>-<YYYYMMDD>`
--   (data local do prestador) e o trigger entrega apenas a quem tem preferência ativa.
-- - Se ambos desligaram booking.reminder em in_app, o evento não é emitido e a
--   contagem retornada reflete corretamente que nenhum lembrete foi disparado.
create or replace function public.create_booking_reminders(p_within_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_within_hours is null or p_within_hours < 1 or p_within_hours > 168 then
    raise exception 'invalid_reminder_window' using errcode = 'P0001';
  end if;

  with eligible_bookings as (
    select b.id, b.starts_at, b.timezone
      from public.bookings b
     where b.status = 'confirmed'
       and b.starts_at > now()
       and b.starts_at <= now() + make_interval(hours => p_within_hours)
       and exists (
         select 1
           from public.providers p
          where p.id = b.provider_id
            and (
              public.is_notification_enabled(b.customer_id, 'booking.reminder', 'in_app')
              or public.is_notification_enabled(p.owner_id, 'booking.reminder', 'in_app')
            )
       )
     order by b.starts_at, b.id
     for update of b skip locked
  ),
  inserted as (
    insert into public.booking_events
      (booking_id, event_type, actor_id, source, reason, external_event_id)
    select
      eligible.id,
      'booking.reminder',
      null,
      'system',
      'Lembrete automático de agendamento',
      'reminder-' || eligible.id::text || '-'
        || to_char(eligible.starts_at at time zone eligible.timezone, 'YYYYMMDD')
    from eligible_bookings eligible
    on conflict (source, external_event_id) do nothing
    returning booking_id
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.create_booking_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.create_booking_reminders(integer)
  to service_role;
