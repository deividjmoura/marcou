-- Google Calendar one-way sync (Issue #29).
-- Additive; not applied to any remote database.
create table public.provider_calendar_connections (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  granted_scope text not null,
  oauth_state_hash text,
  oauth_state_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_event_id uuid not null references public.booking_events(id) on delete cascade,
  operation text not null check (operation in ('upsert','delete')),
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (booking_event_id)
);

create index calendar_sync_outbox_ready_idx
  on public.calendar_sync_outbox (available_at, created_at)
  where status in ('pending','failed');

create table public.booking_calendar_events (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  calendar_id text not null,
  google_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, google_event_id)
);

alter table public.provider_calendar_connections enable row level security;
alter table public.calendar_sync_outbox enable row level security;
alter table public.booking_calendar_events enable row level security;

-- No client policies: these tables are server/service-role only.
revoke all on table public.provider_calendar_connections from public, anon, authenticated;
revoke all on table public.calendar_sync_outbox from public, anon, authenticated;
revoke all on table public.booking_calendar_events from public, anon, authenticated;
grant all on table public.provider_calendar_connections to service_role;
grant all on table public.calendar_sync_outbox to service_role;
grant all on table public.booking_calendar_events to service_role;

create or replace function public.enqueue_calendar_sync_from_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text;
begin
  if new.event_type = 'booking.confirmed' then
    v_operation := 'upsert';
  elsif new.event_type in ('booking.cancelled', 'booking.expired') then
    v_operation := 'delete';
  else
    return new;
  end if;

  insert into public.calendar_sync_outbox (
    booking_id, booking_event_id, operation
  ) values (
    new.booking_id, new.id, v_operation
  ) on conflict (booking_event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_calendar_sync_from_booking_event() from public, anon, authenticated;

create trigger booking_events_calendar_outbox
  after insert on public.booking_events
  for each row execute function public.enqueue_calendar_sync_from_booking_event();

create or replace function public.claim_calendar_sync_jobs(p_limit integer default 10)
returns setof public.calendar_sync_outbox
language sql
security definer
set search_path = public
as $$
  with selected as (
    select id
    from public.calendar_sync_outbox
    where status in ('pending','failed')
      and available_at <= now()
      and attempts < 8
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  ), claimed as (
    update public.calendar_sync_outbox o
    set status = 'processing',
        attempts = attempts + 1,
        processing_started_at = now(),
        last_error_code = null
    from selected
    where o.id = selected.id
    returning o.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_calendar_sync_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_calendar_sync_jobs(integer) to service_role;
