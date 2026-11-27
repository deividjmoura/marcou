-- Serialize reminder generation with booking transitions. A canceled or expired
-- booking cannot be selected after a concurrent state transition commits.
-- The scheduler only emits reminders; expiration is owned by PR #128.
create or replace function public.create_booking_reminders(p_within_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_within_hours is null or p_within_hours < 1 or p_within_hours > 168 then
    raise exception 'invalid_reminder_window' using errcode = 'P0001';
  end if;

  with eligible_bookings as (
    select b.id
    from public.bookings b
    where b.status = 'confirmed'
      and b.starts_at > now()
      and b.starts_at <= now() + make_interval(hours => p_within_hours)
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
      'reminder-' || eligible.id::text || '-' || to_char(now(), 'YYYYMMDD')
    from eligible_bookings eligible
    on conflict (source, external_event_id) do nothing
    returning booking_id
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.create_booking_reminders(integer) from public, anon, authenticated;
grant execute on function public.create_booking_reminders(integer) to service_role;
