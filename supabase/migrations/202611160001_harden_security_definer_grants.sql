-- Hardening: PostgreSQL grants EXECUTE on newly created functions to PUBLIC
-- by default. Revoking only from anon/authenticated does not remove the
-- inherited PUBLIC grant. Explicitly close that path for every SECURITY DEFINER
-- function and grant only the intended API roles.

-- Internal helpers: callable only by their owning SECURITY DEFINER functions.
revoke all on function public.is_interval_available(uuid, timestamptz, timestamptz)
  from PUBLIC, anon, authenticated;
revoke all on function public.notification_payloads(text, public.bookings, public.providers, text)
  from PUBLIC, anon, authenticated;
revoke all on function public.notify_on_booking_event()
  from PUBLIC, anon, authenticated;

-- Background jobs: service_role only.
revoke all on function public.expire_stale_bookings()
  from PUBLIC, anon, authenticated;
grant execute on function public.expire_stale_bookings() to service_role;

revoke all on function public.create_booking_reminders(integer)
  from PUBLIC, anon, authenticated;
grant execute on function public.create_booking_reminders(integer) to service_role;

-- User-facing booking RPCs: authenticated users only.
revoke all on function public.create_booking(text, uuid, timestamptz, text, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.create_booking(text, uuid, timestamptz, text, text, text)
  to authenticated;

revoke all on function public.transition_booking(uuid, text, text)
  from PUBLIC, anon, authenticated;
grant execute on function public.transition_booking(uuid, text, text)
  to authenticated;

-- Public schedule is intentionally readable without authentication.
revoke all on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  from PUBLIC, anon, authenticated;
grant execute on function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  to anon, authenticated;

-- Notification read APIs: authenticated users only; each function also
-- validates auth.uid() and scopes the mutation to the caller.
revoke all on function public.mark_notification_read(uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.mark_notification_read(uuid)
  to authenticated;

revoke all on function public.mark_all_notifications_read()
  from PUBLIC, anon, authenticated;
grant execute on function public.mark_all_notifications_read()
  to authenticated;
