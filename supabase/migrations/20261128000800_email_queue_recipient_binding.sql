-- Hardening da fila de e-mail: vincula o destinatário à reserva e reafirma ACLs.
-- Issue #26 — migration aditiva; não altera dados nem ativa envio real.

create or replace function public.enqueue_email_delivery(
  p_booking_id uuid,
  p_recipient_id uuid,
  p_recipient_role text,
  p_event_type text,
  p_window_key text,
  p_max_attempts integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window text := btrim(coalesce(p_window_key, ''));
  v_key text;
  v_id uuid;
  v_customer_id uuid;
  v_provider_owner_id uuid;
  v_max_attempts integer := coalesce(p_max_attempts, 5);
begin
  if p_booking_id is null or p_recipient_id is null then
    raise exception 'invalid_email_queue_target' using errcode = 'P0001';
  end if;

  if p_recipient_role is null or p_recipient_role not in ('customer', 'provider') then
    raise exception 'invalid_email_recipient_role' using errcode = 'P0001';
  end if;

  if p_event_type is null or p_event_type not in (
    'booking.created',
    'booking.proof_received',
    'booking.confirmed',
    'booking.cancelled',
    'booking.expired',
    'booking.reminder',
    'booking.changed'
  ) then
    raise exception 'invalid_email_event_type' using errcode = 'P0001';
  end if;

  if v_window = '' or length(v_window) > 120 or v_window ~ '[:\\s]' then
    raise exception 'invalid_email_window_key' using errcode = 'P0001';
  end if;

  if v_max_attempts < 1 or v_max_attempts > 20 then
    raise exception 'invalid_email_max_attempts' using errcode = 'P0001';
  end if;

  select b.customer_id, p.owner_id
    into v_customer_id, v_provider_owner_id
    from public.bookings b
    join public.providers p on p.id = b.provider_id
   where b.id = p_booking_id;

  if not found then
    raise exception 'email_booking_not_found' using errcode = 'P0001';
  end if;

  if p_recipient_role = 'customer'
     and v_customer_id is distinct from p_recipient_id then
    raise exception 'email_recipient_booking_mismatch' using errcode = 'P0001';
  end if;

  if p_recipient_role = 'provider'
     and v_provider_owner_id is distinct from p_recipient_id then
    raise exception 'email_recipient_booking_mismatch' using errcode = 'P0001';
  end if;

  v_key := p_booking_id::text || ':' || p_event_type || ':' || v_window || ':' || p_recipient_role;

  insert into public.email_delivery_queue (
    idempotency_key,
    booking_id,
    recipient_id,
    recipient_role,
    event_type,
    window_key,
    max_attempts
  )
  values (
    v_key,
    p_booking_id,
    p_recipient_id,
    p_recipient_role,
    p_event_type,
    v_window,
    v_max_attempts
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_email_delivery(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_email_delivery(uuid, uuid, text, text, text, integer)
  to service_role;

-- Reafirma explicitamente a mesma fronteira server-only da RPC de reprocessamento.
revoke all on function public.reprocess_dead_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.reprocess_dead_email_delivery(uuid)
  to service_role;

comment on function public.enqueue_email_delivery(uuid, uuid, text, text, text, integer) is
  'Enfileira e-mail de forma idempotente somente quando o destinatário corresponde ao cliente ou dono do prestador vinculado à reserva; execução exclusiva de service_role.';
