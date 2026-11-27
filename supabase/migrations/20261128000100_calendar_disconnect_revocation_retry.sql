-- Calendar disconnect: keep the encrypted refresh token until Google confirms
-- revocation. A transient external failure remains retryable by the existing
-- worker instead of deleting the only credential needed for a later retry.

alter table public.calendar_connections
  add column revocation_pending_at timestamptz;

-- Align every SECURITY DEFINER function in the Calendar integration with the
-- repository-wide hardened search_path contract.
alter function public.enqueue_calendar_sync_from_booking_event()
  set search_path = pg_catalog, public;
alter function public.enqueue_calendar_backfill_on_connect()
  set search_path = pg_catalog, public;
alter function public.claim_calendar_sync_jobs(integer)
  set search_path = pg_catalog, public;
alter function public.consume_calendar_oauth_state(text, uuid)
  set search_path = pg_catalog, public;

create or replace function public.finalize_calendar_disconnect(p_provider_id uuid)
returns table (finalized boolean, revoke_token_ciphertext text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform 1
  from public.calendar_connections c
  where c.provider_id = p_provider_id
    and c.disconnect_requested_at is not null
  for update;

  if not found then
    return query select false, null::text;
    return;
  end if;

  if exists (
    select 1 from public.booking_calendar_events m
    where m.provider_id = p_provider_id and m.orphaned_at is null
  ) or exists (
    select 1
    from public.calendar_sync_outbox o
    join public.bookings b on b.id = o.booking_id
    where b.provider_id = p_provider_id
      and o.status = 'processing'
      and o.processing_started_at >= now() - interval '10 minutes'
  ) then
    return query select false, null::text;
    return;
  end if;

  update public.calendar_connections c
     set revocation_pending_at = coalesce(c.revocation_pending_at, now()),
         updated_at = now()
   where c.provider_id = p_provider_id;

  return query
  select true, c.refresh_token_ciphertext
  from public.calendar_connections c
  where c.provider_id = p_provider_id;
end;
$$;

create or replace function public.complete_calendar_disconnect(p_provider_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.calendar_connections c
  where c.provider_id = p_provider_id
    and c.disconnect_requested_at is not null
    and c.revocation_pending_at is not null;

  get diagnostics v_deleted = row_count;
  if v_deleted = 1 then
    return true;
  end if;

  -- Idempotent when another worker completed the same revocation first.
  return not exists (
    select 1 from public.calendar_connections c where c.provider_id = p_provider_id
  );
end;
$$;

revoke all on function public.complete_calendar_disconnect(uuid) from public, anon, authenticated;
grant execute on function public.complete_calendar_disconnect(uuid) to service_role;
