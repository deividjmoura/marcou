-- Operações transacionais do motor de agendamentos.
--
-- Regras de escrita ficam no banco (security definer) para que a restrição de
-- exclusão GiST e a expiração de reservas vencidas se apliquem mesmo sob
-- concorrência. O cliente nunca escreve agendamentos diretamente: as políticas
-- RLS do schema inicial não oferecem INSERT/UPDATE/DELETE em bookings.

-- Duração da reserva temporária por prestador (em minutos). O contrato do
-- domínio proíbe fixar esse valor no código.
alter table public.providers
  add column if not exists booking_hold_minutes integer not null default 30;

-- Contato do cliente no momento da reserva. O prestador precisa saber quem
-- agendou; a reserva guarda a informação sem depender de leitura de perfil.
alter table public.bookings
  add column if not exists customer_name text not null default '',
  add column if not exists customer_phone text not null default '';

alter table public.providers
  drop constraint if exists providers_booking_hold_range;

alter table public.providers
  add constraint providers_booking_hold_range
  check (booking_hold_minutes > 0 and booking_hold_minutes <= 1440);

create index if not exists bookings_expirable_idx
  on public.bookings (expires_at)
  where status in ('pending_payment', 'pending_review') and expires_at is not null;

-- Verifica se o intervalo [starts_at, occupied_until) está dentro de uma
-- janela de disponibilidade do prestador (expediente ou horário especial).
create or replace function public.is_interval_available(
  p_provider_id uuid,
  p_starts_at timestamptz,
  p_occupied_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_day_of_week integer;
  v_custom public.availability_exceptions;
  v_is_blocked boolean;
  v_has_rule boolean;
begin
  if p_starts_at >= p_occupied_until then
    return false;
  end if;

  select timezone into v_timezone
  from public.providers where id = p_provider_id;

  if v_timezone is null then
    return false;
  end if;

  v_local_date := (p_starts_at at time zone v_timezone)::date;
  v_local_start := (p_starts_at at time zone v_timezone)::time;
  v_local_end := (p_occupied_until at time zone v_timezone)::time;
  v_day_of_week := extract(dow from v_local_date)::int;

  -- Ocupar além da meia-noite não é oferecido como slot.
  if v_local_end <= v_local_start then
    return false;
  end if;

  select exists (
    select 1 from public.availability_exceptions
    where provider_id = p_provider_id
      and exception_date = v_local_date
      and kind = 'blocked'
  ) into v_is_blocked;

  if v_is_blocked then
    return false;
  end if;

  select * into v_custom
  from public.availability_exceptions
  where provider_id = p_provider_id
    and exception_date = v_local_date
    and kind = 'custom_hours';

  if found then
    return v_custom.starts_at is not null
      and v_custom.ends_at is not null
      and v_local_start >= v_custom.starts_at
      and v_local_end <= v_custom.ends_at;
  end if;

  select exists (
    select 1 from public.availability_rules
    where provider_id = p_provider_id
      and is_active
      and day_of_week = v_day_of_week
      and (valid_from is null or valid_from <= v_local_date)
      and (valid_until is null or valid_until >= v_local_date)
      and starts_at <= v_local_start
      and ends_at >= v_local_end
  ) into v_has_rule;

  return v_has_rule;
end;
$$;

revoke all on function public.is_interval_available(uuid, timestamptz, timestamptz) from public;

-- Expira reservas temporárias vencidas de forma idempotente, liberando o slot
-- sem apagar o histórico. Uso típico: cron/service role e internamente antes
-- de uma nova reserva.
create or replace function public.expire_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.bookings b
  set status = 'expired', updated_at = now()
  where b.status in ('pending_payment', 'pending_review')
    and b.expires_at is not null
    and b.expires_at <= now();

  get diagnostics v_count = row_count;

  insert into public.booking_events
    (booking_id, event_type, actor_id, source, reason, external_event_id)
  select
    b.id,
    'booking.expired',
    null,
    'system',
    'Reserva temporária vencida',
    'system-expire-' || b.id::text
  from public.bookings b
  where b.status = 'expired'
    and not exists (
      select 1 from public.booking_events e
      where e.booking_id = b.id and e.event_type = 'booking.expired'
    )
  on conflict (source, external_event_id) do nothing;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_bookings() from anon, authenticated;
grant execute on function public.expire_stale_bookings() to service_role;

-- Agenda pública de um prestador: regras, exceções e intervalos ocupados.
-- Retorna NULL quando o prestador não existe ou não está publicado.
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
declare
  v_provider public.providers;
  v_service public.services;
begin
  select * into v_provider
  from public.providers
  where slug = p_provider_slug and is_published;

  if not found then
    return null;
  end if;

  select * into v_service
  from public.services
  where id = p_service_id and provider_id = v_provider.id and is_active;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'timezone', v_provider.timezone,
    'bookingHoldMinutes', v_provider.booking_hold_minutes,
    'timing', jsonb_build_object(
      'durationMinutes', v_service.duration_minutes,
      'bufferMinutes', v_service.buffer_minutes
    ),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dayOfWeek', r.day_of_week,
        'startsAtMinutes', (extract(epoch from r.starts_at) / 60)::int,
        'endsAtMinutes', (extract(epoch from r.ends_at) / 60)::int,
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
          else (extract(epoch from e.starts_at) / 60)::int end,
        'endsAtMinutes', case when e.ends_at is null then null
          else (extract(epoch from e.ends_at) / 60)::int end
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

revoke all on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz) from public;
grant execute on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  to anon, authenticated;

-- Cria uma reserva temporária de forma atômica e idempotente.
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
declare
  v_actor uuid := auth.uid();
  v_provider public.providers;
  v_service public.services;
  v_booking public.bookings;
  v_occupied_until timestamptz;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select b.* into v_booking
    from public.booking_events e
    join public.bookings b on b.id = e.booking_id
    where e.source = 'web' and e.external_event_id = p_idempotency_key
    limit 1;

    if found then
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

  select * into v_service
  from public.services
  where id = p_service_id and provider_id = v_provider.id and is_active;

  if not found then
    raise exception 'service_not_available' using errcode = 'P0001';
  end if;

  if p_starts_at <= now() then
    raise exception 'slot_in_the_past' using errcode = 'P0001';
  end if;

  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'customer_name_required' using errcode = 'P0001';
  end if;

  v_occupied_until := p_starts_at
    + make_interval(mins => v_service.duration_minutes + v_service.buffer_minutes);

  if not public.is_interval_available(
    v_provider.id, p_starts_at, v_occupied_until
  ) then
    raise exception 'outside_working_hours' using errcode = 'P0001';
  end if;

  -- Serializa as reservas do prestador e evita que duas transações disputem
  -- o mesmo horário. A constraint de exclusão continua sendo a garantia final.
  perform pg_advisory_xact_lock(hashtextextended(v_provider.id::text, 0));

  -- Libera reservas vencidas que conflitam com o intervalo solicitado.
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
      provider_id,
      customer_id,
      service_id,
      starts_at,
      ends_at,
      occupied_until,
      timezone,
      customer_name,
      customer_phone,
      service_name_snapshot,
      duration_minutes_snapshot,
      price_cents_snapshot,
      deposit_cents_snapshot,
      buffer_minutes_snapshot,
      status,
      expires_at
    ) values (
      v_provider.id,
      v_actor,
      v_service.id,
      p_starts_at,
      p_starts_at + make_interval(mins => v_service.duration_minutes),
      v_occupied_until,
      v_provider.timezone,
      btrim(p_customer_name),
      coalesce(btrim(p_customer_phone), ''),
      v_service.name,
      v_service.duration_minutes,
      v_service.price_cents,
      v_service.deposit_cents,
      v_service.buffer_minutes,
      'pending_payment',
      now() + make_interval(mins => v_provider.booking_hold_minutes)
    )
    returning * into v_booking;

    insert into public.booking_events
      (booking_id, event_type, actor_id, source, reason, external_event_id)
    values
      (v_booking.id, 'booking.created', v_actor, 'web',
       'Reserva criada pelo cliente', p_idempotency_key);
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    when unique_violation then
      -- Mesma chave de idempotência em concorrência: devolve a reserva já
      -- criada e descarta a duplicata.
      select b.* into v_booking
      from public.booking_events e
      join public.bookings b on b.id = e.booking_id
      where e.source = 'web' and e.external_event_id = p_idempotency_key
      limit 1;
  end;

  return v_booking;
end;
$$;

revoke all on function public.create_booking(text, uuid, timestamptz, text, text, text) from anon;
grant execute on function public.create_booking(text, uuid, timestamptz, text, text, text) to authenticated;

-- Aplica uma transição de estado com autorização, validade e auditoria.
create or replace function public.transition_booking(
  p_booking_id uuid,
  p_event text,
  p_idempotency_key text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_new_status public.booking_status;
  v_audit_event text;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select b.* into v_booking
    from public.booking_events e
    join public.bookings b on b.id = e.booking_id
    where e.source = 'web' and e.external_event_id = p_idempotency_key
    limit 1;

    if found then
      return v_booking;
    end if;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  select * into v_provider from public.providers where id = v_booking.provider_id;

  if v_booking.customer_id <> v_actor and v_provider.owner_id <> v_actor then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Evento tardio sobre reserva vencida: encerra a reserva e não confirma.
  if p_event <> 'expire'
    and v_booking.status in ('pending_payment', 'pending_review')
    and v_booking.expires_at is not null
    and v_booking.expires_at <= now()
  then
    -- Atualiza e retorna (sem RAISE) para que o commit preserve a expiração;
    -- a camada de aplicação traduz o status em erro para quem chamou.
    update public.bookings
    set status = 'expired', updated_at = now()
    where id = v_booking.id
    returning * into v_booking;

    insert into public.booking_events
      (booking_id, event_type, actor_id, source, reason, external_event_id)
    values
      (v_booking.id, 'booking.expired', v_actor, 'web',
       'Reserva vencida antes do evento', 'system-expire-' || v_booking.id::text)
    on conflict (source, external_event_id) do nothing;

    return v_booking;
  end if;

  case p_event
    when 'proof_received' then
      if v_booking.status <> 'pending_payment' then
        raise exception 'invalid_transition' using errcode = 'P0001';
      end if;
      v_new_status := 'pending_review';
      v_audit_event := 'booking.proof_received';
    when 'payment_approved' then
      -- Somente o prestador (ou fonte confiável) aprova o sinal.
      if v_provider.owner_id <> v_actor then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;
      if v_booking.status <> 'pending_review' then
        raise exception 'invalid_transition' using errcode = 'P0001';
      end if;
      v_new_status := 'confirmed';
      v_audit_event := 'booking.confirmed';
    when 'cancel' then
      if v_booking.status not in ('pending_payment', 'pending_review', 'confirmed') then
        raise exception 'invalid_transition' using errcode = 'P0001';
      end if;
      v_new_status := 'cancelled';
      v_audit_event := 'booking.cancelled';
    when 'expire' then
      if v_provider.owner_id <> v_actor then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;
      if v_booking.status not in ('pending_payment', 'pending_review') then
        raise exception 'invalid_transition' using errcode = 'P0001';
      end if;
      if v_booking.expires_at is null or v_booking.expires_at > now() then
        raise exception 'invalid_transition' using errcode = 'P0001';
      end if;
      v_new_status := 'expired';
      v_audit_event := 'booking.expired';
    else
      raise exception 'invalid_event' using errcode = 'P0001';
  end case;

  update public.bookings
  set
    status = v_new_status,
    expires_at = case when v_new_status = 'confirmed' then null else expires_at end,
    updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  insert into public.booking_events
    (booking_id, event_type, actor_id, source, reason, external_event_id)
  values
    (v_booking.id, v_audit_event, v_actor, 'web', null, p_idempotency_key);

  return v_booking;
end;
$$;

revoke all on function public.transition_booking(uuid, text, text) from anon;
grant execute on function public.transition_booking(uuid, text, text) to authenticated;

-- Privilégios de tabela. O Supabase normalmente concede isso por privilégios
-- padrão, mas declaramos explicitamente para tornar a migration autocontida.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;

grant select on public.providers to anon, authenticated;
grant insert, update, delete on public.providers to authenticated;

grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;

grant select on public.availability_rules to anon, authenticated;
grant insert, update, delete on public.availability_rules to authenticated;

grant select on public.availability_exceptions to anon, authenticated;
grant insert, update, delete on public.availability_exceptions to authenticated;

-- anon recebe o privilégio de tabela, mas as políticas RLS (to authenticated)
-- negam qualquer linha: a defesa é a policy, não a ausência de grant.
grant select on public.bookings, public.booking_events to anon, authenticated;

grant all on all tables in schema public to service_role;
