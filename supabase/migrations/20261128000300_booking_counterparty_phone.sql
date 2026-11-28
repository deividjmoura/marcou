-- Telefone da contraparte de uma reserva, só para participantes autorizados.
-- Cliente vê o telefone do perfil do dono do prestador; prestador vê customer_phone.
-- SECURITY DEFINER com search_path fixo; execute apenas para authenticated.

create or replace function public.booking_counterparty_phone(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_owner_id uuid;
  v_phone text;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    return null;
  end if;

  select p.owner_id into v_owner_id
  from public.providers p
  where p.id = v_booking.provider_id;

  if v_owner_id is null then
    return null;
  end if;

  -- Prestador (dono): telefone do cliente gravado na reserva
  if v_owner_id = v_uid then
    return nullif(btrim(v_booking.customer_phone), '');
  end if;

  -- Cliente da reserva: telefone do perfil do dono do negócio
  if v_booking.customer_id = v_uid then
    select nullif(btrim(pr.phone), '') into v_phone
    from public.profiles pr
    where pr.id = v_owner_id;
    return v_phone;
  end if;

  return null;
end;
$$;

revoke all on function public.booking_counterparty_phone(uuid) from public;
revoke all on function public.booking_counterparty_phone(uuid) from anon;
revoke all on function public.booking_counterparty_phone(uuid) from authenticated;
grant execute on function public.booking_counterparty_phone(uuid) to authenticated;

comment on function public.booking_counterparty_phone(uuid) is
  'Retorna o telefone da contraparte da reserva apenas se auth.uid() for o cliente ou o dono do prestador. Sem exposição em listagens.';
