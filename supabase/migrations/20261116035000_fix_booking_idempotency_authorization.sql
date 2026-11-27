-- Corrige replay de idempotência para nunca retornar reservas antes da autorização.
-- As RPCs são SECURITY DEFINER; portanto, a autorização precisa ser explícita
-- dentro da função, inclusive nos caminhos de repetição e concorrência.

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

  -- O replay de criação só pode devolver uma reserva pertencente ao ator.
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
      v_provider.id, v_actor, v_service.id, p_starts_at,
      p_starts_at + make_interval(mins => v_service.duration_minutes),
      v_occupied_until, v_provider.timezone, btrim(p_customer_name),
      coalesce(btrim(p_customer_phone), ''), v_service.name,
      v_service.duration_minutes, v_service.price_cents,
      v_service.deposit_cents, v_service.buffer_minutes,
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
      -- Em corrida, só o ator que criou a reserva pode receber o replay.
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

revoke all on function public.create_booking(text, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.create_booking(text, uuid, timestamptz, text, text, text) to authenticated;

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

  -- Primeiro carrega a reserva solicitada e valida o participante.
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  select * into v_provider
  from public.providers
  where id = v_booking.provider_id;

  if v_booking.customer_id <> v_actor and v_provider.owner_id <> v_actor then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Só depois da autorização é permitido consultar/reproduzir uma operação.
  if p_idempotency_key is not null then
    select b.* into v_booking
    from public.booking_events e
    join public.bookings b on b.id = e.booking_id
    where e.source = 'web'
      and e.booking_id = p_booking_id
      and e.actor_id = v_actor
      and e.external_event_id = p_idempotency_key
      and e.event_type = case p_event
        when 'proof_received' then 'booking.proof_received'
        when 'payment_approved' then 'booking.confirmed'
        when 'cancel' then 'booking.cancelled'
        when 'expire' then 'booking.expired'
        else ''
      end
    limit 1;

    if found then
      return v_booking;
    end if;

    -- Uma chave já usada por outra operação/ator não pode ser reaproveitada.
    if exists (
      select 1 from public.booking_events e
      where e.source = 'web'
        and e.external_event_id = p_idempotency_key
    ) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;

    -- Restaura a linha alvo depois da consulta de replay (que pode não achar).
    select * into v_booking
    from public.bookings
    where id = p_booking_id
    for update;
  end if;

  if p_event <> 'expire'
    and v_booking.status in ('pending_payment', 'pending_review')
    and v_booking.expires_at is not null
    and v_booking.expires_at <= now()
  then
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

revoke all on function public.transition_booking(uuid, text, text) from public, anon;
grant execute on function public.transition_booking(uuid, text, text) to authenticated;
