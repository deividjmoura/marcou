-- Calendar worker lease fencing.
-- Each claim gets a fresh opaque token. A worker may persist an outcome only
-- while it still owns that exact lease; a timed-out worker cannot acknowledge
-- a job after another worker has reclaimed it.

alter table public.calendar_sync_outbox
  add column lease_token uuid;

-- Preserve any in-flight rows during a rolling deployment. Their current
-- worker receives a token on the next claim; old workers without the token
-- cannot complete them after this migration.
update public.calendar_sync_outbox
   set lease_token = gen_random_uuid()
 where status = 'processing';

alter table public.calendar_sync_outbox
  add constraint calendar_sync_outbox_lease_token_check
  check (
    (status = 'processing' and lease_token is not null)
    or (status <> 'processing' and lease_token is null)
  );

create or replace function public.claim_calendar_sync_jobs(p_limit integer default 10)
returns setof public.calendar_sync_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25));
begin
  update public.calendar_sync_outbox o
  set status = 'dead',
      completed_at = now(),
      processing_started_at = null,
      lease_token = null,
      last_error_code = coalesce(o.last_error_code, 'worker_timeout_max_attempts')
  where o.attempts >= 8
    and (
      o.status = 'failed'
      or (o.status = 'processing' and o.processing_started_at < now() - interval '10 minutes')
    );

  return query
  with heads as (
    select distinct on (h.booking_id) h.id
    from public.calendar_sync_outbox h
    where h.status in ('pending','failed','processing')
    order by h.booking_id, h.created_at, h.id
  ), selected as (
    select o.id
    from public.calendar_sync_outbox o
    join heads on heads.id = o.id
    where (
        o.status in ('pending','failed')
        or (o.status = 'processing' and o.processing_started_at < now() - interval '10 minutes')
      )
      and o.available_at <= now()
      and o.attempts < 8
    order by o.available_at, o.created_at, o.id
    for update of o skip locked
    limit v_limit
  )
  update public.calendar_sync_outbox o
  set status = 'processing',
      attempts = o.attempts + 1,
      processing_started_at = now(),
      lease_token = gen_random_uuid(),
      last_error_code = null
  from selected
  where o.id = selected.id
  returning o.*;
end;
$$;

revoke all on function public.claim_calendar_sync_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_calendar_sync_jobs(integer) to service_role;
