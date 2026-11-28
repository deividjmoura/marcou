-- SECURITY — use a hardened search_path for the multi-service booking RPCs.
--
-- The original migration 20261125120000 created/replaced these SECURITY
-- DEFINER functions with search_path = public. Keep the historical migration
-- immutable and harden the live definitions with a forward-only migration.
-- PUBLIC/anon/authenticated EXECUTE grants are unchanged here; their least-
-- privilege ACLs remain defined by the original migration and #117 baseline.

alter function public.booking_service_totals(uuid, uuid[])
  set search_path = pg_catalog, public;

alter function public.get_provider_schedule(text, uuid[], date, timestamptz, timestamptz)
  set search_path = pg_catalog, public;

alter function public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)
  set search_path = pg_catalog, public;

alter function public.create_booking(text, uuid[], timestamptz, text, text, text)
  set search_path = pg_catalog, public;

alter function public.create_booking(text, uuid, timestamptz, text, text, text)
  set search_path = pg_catalog, public;
