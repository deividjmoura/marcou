-- Correção incremental: serializa transições concorrentes sobre a mesma reserva.
-- Preserva o histórico: não altera migrations anteriores já aplicadas.

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

revoke all on function public.transition_booking(uuid, text, text) from public, anon;
grant execute on function public.transition_booking(uuid, text, text) to authenticated;
