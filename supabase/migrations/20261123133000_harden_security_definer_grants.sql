-- Least-privilege baseline for every SECURITY DEFINER function.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default. Revoking only from `anon` or
-- `authenticated` is insufficient because both inherit PUBLIC. Remove that
-- implicit path from every definer function that exists at this migration, then
-- restate the intended API grants for sensitive jobs and notification RPCs.

do $$
declare
  function_signature text;
begin
  for function_signature in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public',
      function_signature
    );
  end loop;
end
$$;

-- Internal helpers are invoked by trusted definer functions/triggers only.
revoke all on function public.is_interval_available(uuid, timestamptz, timestamptz)
  from anon, authenticated;
revoke all on function public.notification_payloads(
  text,
  public.bookings,
  public.providers,
  text
) from anon, authenticated;
revoke all on function public.notify_on_booking_event()
  from anon, authenticated;

-- Background jobs are never browser APIs.
revoke all on function public.expire_stale_bookings()
  from anon, authenticated;
grant execute on function public.expire_stale_bookings()
  to service_role;

revoke all on function public.create_booking_reminders(integer)
  from anon, authenticated;
grant execute on function public.create_booking_reminders(integer)
  to service_role;

-- Booking commands derive actor/ownership in the database and require a user.
revoke all on function public.create_booking(
  text,
  uuid,
  timestamptz,
  text,
  text,
  text
) from anon;
grant execute on function public.create_booking(
  text,
  uuid,
  timestamptz,
  text,
  text,
  text
) to authenticated;

revoke all on function public.transition_booking(uuid, text, text)
  from anon;
grant execute on function public.transition_booking(uuid, text, text)
  to authenticated;

-- Public schedule is the intentional anonymous read API.
grant execute on function public.get_provider_schedule(
  text,
  uuid,
  date,
  timestamptz,
  timestamptz
) to anon, authenticated;

-- Notification mutations scope rows to auth.uid() internally.
revoke all on function public.mark_notification_read(uuid)
  from anon;
grant execute on function public.mark_notification_read(uuid)
  to authenticated;

revoke all on function public.mark_all_notifications_read()
  from anon;
grant execute on function public.mark_all_notifications_read()
  to authenticated;

comment on function public.expire_stale_bookings() is
  'Background job restricted to service_role; never a browser RPC.';
comment on function public.create_booking_reminders(integer) is
  'Background job restricted to service_role; never a browser RPC.';
