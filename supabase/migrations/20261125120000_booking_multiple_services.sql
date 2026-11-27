-- Agendamento com múltiplos serviços — Issue #21.
--
-- Migration aditiva, derivada do esboço incompleto
-- `202611150004_booking_multiple_services.sql` da branch
-- `feat/21-booking-multiple-services`. Nenhuma dessas linhas foi aplicada ao
-- Supabase remoto. Não aplicar em produção sem autorização do responsável.
--
-- Decisões:
-- - `booking_services` guarda um registro por serviço com snapshot próprio.
-- - `bookings.service_id` continua apontando para o primeiro serviço (chave
--   legada) e os snapshots agregados de bookings passam a representar o total
--   da reserva. Reservas de serviço único não mudam de significado.
-- - Duração, preço e sinal são sempre calculados no banco a partir de
--   `services`; o navegador envia apenas IDs + início desejado. O tempo ocupado
--   é a soma das durações + intervalo APENAS do último serviço (decisão do
--   responsável).
-- - Privilégios amplos concedidos por default a tabelas novas são revogados
--   antes de conceder somente SELECT; a RLS permanece.
-- - GiST + `pg_advisory_xact_lock` permanecem como barreira final de concorrência.

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  provider_id uuid not null,
  service_id uuid not null,
  position integer not null check (position >= 0),
  service_name_snapshot text not null,
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0),
  deposit_cents_snapshot integer not null check (deposit_cents_snapshot >= 0),
  buffer_minutes_snapshot integer not null check (buffer_minutes_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint booking_services_unique_position unique (booking_id, position),
  constraint booking_services_unique_service unique (booking_id, service_id),
  constraint booking_services_provider_service_fk
    foreign key (provider_id, service_id)
    references public.services (provider_id, id) on delete restrict
);

create index if not exists booking_services_booking_idx
  on public.booking_services (booking_id, position);

alter table public.booking_services enable row level security;

-- Leitura apenas para participantes; escrita permanece exclusiva das RPCs.
drop policy if exists "booking_services_read_participants" on public.booking_services;
create policy "booking_services_read_participants"
  on public.booking_services for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.providers p on p.id = b.provider_id
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or p.owner_id = (select auth.uid()))
    )
  );

-- O Supabase concede privilégios amplos por default a novas tabelas em public.
-- Revogamos explicitamente antes de conceder só o necessário: a RLS continua
-- limitando a leitura aos participantes e nenhuma política de escrita existe.
revoke all on table public.booking_services from public, anon, authenticated;
grant select on table public.booking_services to authenticated;
grant all on table public.booking_services to service_role;

-- Preserva o histórico: toda reserva antiga de serviço único passa a ter uma
-- linha espelho com os snapshots que já estavam persistidos em `bookings`.
insert into public.booking_services (
  booking_id,
  provider_id,
  service_id,
  position,
  service_name_snapshot,
  duration_minutes_snapshot,
  price_cents_snapshot,
  deposit_cents_snapshot,
  buffer_minutes_snapshot
)
select
  b.id,
  b.provider_id,
  b.service_id,
  0,
  b.service_name_snapshot,
  b.duration_minutes_snapshot,
  b.price_cents_snapshot,
  b.deposit_cents_snapshot,
  b.buffer_minutes_snapshot
from public.bookings b
on conflict (booking_id, service_id) do nothing;

-- Fonte de verdade dos totais. Helper interno: as RPCs chamadoras já validam
-- autenticação/propriedade; o cliente não pode executá-lo.
create or replace function public.booking_service_totals(
  p_provider_id uuid,
  p_service_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_service_ids, 1), 0);
  v_valid_count integer;
  v_services jsonb;
  v_duration integer;
  v_last_buffer integer;
  v_price integer;
  v_deposit integer;
  v_name text;
begin
  if v_count = 0 or v_count > 20 then
    raise exception 'service_not_available' using errcode = 'P0001';
  end if;

  select count(distinct s.id) into v_valid_count
  from unnest(p_service_ids) as ids(id)
  join public.services s on s.id = ids.id
  where s.provider_id = p_provider_id and s.is_active;

  if v_valid_count <> v_count then
    raise exception 'service_not_available' using errcode = 'P0001';
  end if;

  select
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'durationMinutes', s.duration_minutes,
        'priceCents', s.price_cents,
        'depositCents', s.deposit_cents,
        'bufferMinutes', s.buffer_minutes
      )
      order by ids.ord
    ),
    sum(s.duration_minutes)::integer,
    -- Decisão do responsável: soma das durações + intervalo APENAS do último
    -- serviço da seleção (maior `ord`), não a soma dos intervalos.
    (array_agg(s.buffer_minutes order by ids.ord desc))[1]::integer,
    sum(s.price_cents)::integer,
    sum(s.deposit_cents)::integer,
    left(string_agg(s.name, ' + ' order by ids.ord), 180)
  into v_services, v_duration, v_last_buffer, v_price, v_deposit, v_name
  from unnest(p_service_ids) with ordinality as ids(id, ord)
  join public.services s on s.id = ids.id;

  return jsonb_build_object(
    'serviceIds', to_jsonb(p_service_ids),
    'services', v_services,
    'nameSnapshot', v_name,
    'durationMinutes', v_duration,
    'bufferMinutes', v_last_buffer,
    'occupiedMinutes', v_duration + v_last_buffer,
    'priceCents', v_price,
    'depositCents', v_deposit
  );
end;
$$;

revoke all on function public.booking_service_totals(uuid, uuid[])
  from public, anon, authenticated, service_role;

-- Agenda pública para o conjunto de serviços. O `timing` devolvido já é o
-- agregado calculado no banco, usado pela projeção de slots na interface.
create or replace function public.get_provider_schedule(
  p_provider_slug text,
  p_service_ids uuid[],
  p_date date,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider public.providers;
  v_totals jsonb;
  v_count integer;
  v_all_active boolean;
begin
  select * into v_provider
  from public.providers
  where slug = p_provider_slug and is_published;

  if not found then
    return null;
  end if;

  v_count := coalesce(array_length(p_service_ids, 1), 0);
  if v_count = 0 or v_count > 20 then
    return null;
  end if;

  select
    count(s.id) = v_count and count(distinct s.id) = v_count
  into v_all_active
  from unnest(p_service_ids) as ids(id)
  join public.services s on s.id = ids.id
  where s.provider_id = v_provider.id and s.is_active;

  if not coalesce(v_all_active, false) then
    return null;
  end if;

  v_totals := public.booking_service_totals(v_provider.id, p_service_ids);

  return jsonb_build_object(
    'timezone', v_provider.timezone,
    'bookingHoldMinutes', v_provider.booking_hold_minutes,
    'serviceIds', to_jsonb(p_service_ids),
    'services', v_totals -> 'services',
    'totals', jsonb_build_object(
      'durationMinutes', (v_totals ->> 'durationMinutes')::integer,
      'bufferMinutes', (v_totals ->> 'bufferMinutes')::integer,
      'occupiedMinutes', (v_totals ->> 'occupiedMinutes')::integer,
      'priceCents', (v_totals ->> 'priceCents')::integer,
      'depositCents', (v_totals ->> 'depositCents')::integer
    ),
    'timing', jsonb_build_object(
      'durationMinutes', (v_totals ->> 'durationMinutes')::integer,
      'bufferMinutes', (v_totals ->> 'bufferMinutes')::integer
    ),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dayOfWeek', r.day_of_week,
        'startsAtMinutes', (extract(epoch from r.starts_at) / 60)::integer,
        'endsAtMinutes', (extract(epoch from r.ends_at) / 60)::integer,
        'validFrom', r.valid_from,
        'validUntil', r.valid_until,
        'isActive', r.is_active
      ) order by r.day_of_week, r.starts_at), '[]'::jsonb)
      from public.availability_rules r
      where r.provider_id = v_provider.id and r.is_active
    ),
    'exceptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', e.exception_date,
        'kind', e.kind,
        'startsAtMinutes', case when e.starts_at is null then null
          else (extract(epoch from e.starts_at) / 60)::integer end,
        'endsAtMinutes', case when e.ends_at is null then null
          else (extract(epoch from e.ends_at) / 60)::integer end
      ) order by e.exception_date), '[]'::jsonb)
      from public.availability_exceptions e
      where e.provider_id = v_provider.id
        and e.exception_date between p_date - 1 and p_date + 1
    ),
    'busy', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'startsAt', b.starts_at,
        'occupiedUntil', b.occupied_until
      ) order by b.starts_at), '[]'::jsonb)
      from public.bookings b
      where b.provider_id = v_provider.id
        and b.status in ('pending_payment', 'pending_review', 'confirmed')
        and tstzrange(b.starts_at, b.occupied_until, '[)')
            && tstzrange(p_from, p_to, '[)')
    )
  );
end;
$$;

-- Assinatura legada: um serviço continua funcionando exatamente como antes.
create or replace function public.get_provider_schedule(
  p_provider_slug text,
  p_service_id uuid,
  p_date date,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_provider_schedule(
    p_provider_slug,
    array[p_service_id]::uuid[],
    p_date,
    p_from,
    p_to
  );
end;
$$;

revoke all on function public.get_provider_schedule(text, uuid[], date, timestamptz, timestamptz)
  from public;
revoke all on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  from public;
grant execute on function public.get_provider_schedule(text, uuid[], date, timestamptz, timestamptz)
  to anon, authenticated;
grant execute on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  to anon, authenticated;

-- Criação atômica para o conjunto. Nenhum total vem do navegador.
create or replace function public.create_booking(
  p_provider_slug text,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_idempotency_key text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_provider public.providers;
  v_totals jsonb;
  v_booking public.bookings;
  v_occupied_until timestamptz;
  v_primary_service uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  -- Replay só devolve reserva pertencente ao ator (autorização antes da leitura).
  if p_idempotency_key is not null then
    select b.* into v_booking
    from public.booking_events e
    join public.bookings b on b.id = e.booking_id
    where e.source = 'web'
      and e.event_type = 'booking.created'
      and e.external_event_id = p_idempotency_key
    limit 1;

    if found then
      if v_booking.customer_id <> v_actor then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;
      return v_booking;
    end if;
  end if;

  select * into v_provider
  from public.providers
  where slug = p_provider_slug;

  if not found then
    raise exception 'provider_not_found' using errcode = 'P0001';
  end if;

  if not v_provider.is_published then
    raise exception 'provider_not_published' using errcode = 'P0001';
  end if;

  -- Valida todos os IDs (ativos, do mesmo prestador, sem duplicatas) e calcula
  -- duração, intervalo, preço e sinal a partir das linhas persistidas.
  v_totals := public.booking_service_totals(v_provider.id, p_service_ids);
  v_primary_service := (p_service_ids)[1];

  if p_starts_at <= now() then
    raise exception 'slot_in_the_past' using errcode = 'P0001';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer_name_required' using errcode = 'P0001';
  end if;

  -- Decisão do responsável: tempo ocupado = soma das durações de todos os
  -- serviços + intervalo apenas do último serviço da seleção. Os snapshots
  -- por serviço em `booking_services` continuam registrando cada intervalo.
  v_occupied_until := p_starts_at
    + make_interval(mins => (v_totals ->> 'occupiedMinutes')::integer);

  -- Um único intervalo combinado cobre expediente, bloqueios e reservas.
  if not public.is_interval_available(
    v_provider.id, p_starts_at, v_occupied_until
  ) then
    raise exception 'outside_working_hours' using errcode = 'P0001';
  end if;

  -- Serializa a disputa por prestador; a constraint GiST continua sendo a
  -- garantia final contra sobreposição de reservas ativas.
  perform pg_advisory_xact_lock(hashtextextended(v_provider.id::text, 0));

  with expired as (
    update public.bookings b
    set status = 'expired', updated_at = now()
    where b.provider_id = v_provider.id
      and b.status in ('pending_payment', 'pending_review')
      and b.expires_at is not null
      and b.expires_at <= now()
      and tstzrange(b.starts_at, b.occupied_until, '[)')
          && tstzrange(p_starts_at, v_occupied_until, '[)')
    returning b.id
  )
  insert into public.booking_events
    (booking_id, event_type, actor_id, source, reason, external_event_id)
  select
    id,
    'booking.expired',
    null,
    'system',
    'Reserva temporária vencida antes de nova reserva',
    'system-expire-' || id::text
  from expired
  on conflict (source, external_event_id) do nothing;

  begin
    insert into public.bookings (
      provider_id, customer_id, service_id, starts_at, ends_at,
      occupied_until, timezone, customer_name, customer_phone,
      service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot,
      deposit_cents_snapshot, buffer_minutes_snapshot, status, expires_at
    ) values (
      v_provider.id,
      v_actor,
      v_primary_service,
      p_starts_at,
      p_starts_at + make_interval(mins => (v_totals ->> 'durationMinutes')::integer),
      v_occupied_until,
      v_provider.timezone,
      btrim(p_customer_name),
      coalesce(btrim(p_customer_phone), ''),
      v_totals ->> 'nameSnapshot',
      (v_totals ->> 'durationMinutes')::integer,
      (v_totals ->> 'priceCents')::integer,
      (v_totals ->> 'depositCents')::integer,
      (v_totals ->> 'bufferMinutes')::integer,
      'pending_payment',
      now() + make_interval(mins => v_provider.booking_hold_minutes)
    )
    returning * into v_booking;

    insert into public.booking_services (
      booking_id,
      provider_id,
      service_id,
      position,
      service_name_snapshot,
      duration_minutes_snapshot,
      price_cents_snapshot,
      deposit_cents_snapshot,
      buffer_minutes_snapshot
    )
    select
      v_booking.id,
      v_provider.id,
      (service ->> 'id')::uuid,
      (ordinal - 1)::integer,
      service ->> 'name',
      (service ->> 'durationMinutes')::integer,
      (service ->> 'priceCents')::integer,
      (service ->> 'depositCents')::integer,
      (service ->> 'bufferMinutes')::integer
    from jsonb_array_elements(v_totals -> 'services')
      with ordinality as items(service, ordinal);

    insert into public.booking_events
      (booking_id, event_type, actor_id, source, reason, external_event_id)
    values
      (v_booking.id, 'booking.created', v_actor, 'web',
       'Reserva criada pelo cliente', p_idempotency_key);
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    when unique_violation then
      -- Mesma chave em concorrência: só o criador recebe o replay.
      select b.* into v_booking
      from public.booking_events e
      join public.bookings b on b.id = e.booking_id
      where e.source = 'web'
        and e.event_type = 'booking.created'
        and e.external_event_id = p_idempotency_key
      limit 1;

      if not found or v_booking.customer_id <> v_actor then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;
  end;

  return v_booking;
end;
$$;

-- Assinatura legada: delega para o caminho agregado com um único serviço.
create or replace function public.create_booking(
  p_provider_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_idempotency_key text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_booking(
    p_provider_slug,
    array[p_service_id]::uuid[],
    p_starts_at,
    p_customer_name,
    p_customer_phone,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.create_booking(text, uuid[], timestamptz, text, text, text)
  from public, anon;
revoke all on function public.create_booking(text, uuid, timestamptz, text, text, text)
  from public, anon;
grant execute on function public.create_booking(text, uuid[], timestamptz, text, text, text)
  to authenticated;
grant execute on function public.create_booking(text, uuid, timestamptz, text, text, text)
  to authenticated;
