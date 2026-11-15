-- Marcou initial schema.
-- Reservation writes must later be wrapped in a server-side transaction/RPC
-- that expires overlapping stale holds before inserting a new booking.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.booking_status as enum (
  'pending_payment',
  'pending_review',
  'confirmed',
  'cancelled',
  'expired'
);

create type public.availability_exception_kind as enum (
  'blocked',
  'custom_hours'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  timezone text not null default 'America/Sao_Paulo',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_slug_format check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$')
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_deposit_not_above_price check (deposit_cents <= price_cents),
  unique (provider_id, id)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_rule_time_order check (starts_at < ends_at),
  constraint availability_rule_date_order check (
    valid_from is null or valid_until is null or valid_from <= valid_until
  )
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  exception_date date not null,
  kind public.availability_exception_kind not null,
  starts_at time,
  ends_at time,
  note text,
  created_at timestamptz not null default now(),
  constraint availability_exception_time_pair check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and starts_at < ends_at)
  ),
  constraint custom_hours_require_time check (
    kind <> 'custom_hours' or (starts_at is not null and ends_at is not null)
  )
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  customer_id uuid not null references auth.users (id) on delete restrict,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_until timestamptz not null,
  timezone text not null,
  service_name_snapshot text not null,
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0),
  deposit_cents_snapshot integer not null check (deposit_cents_snapshot >= 0),
  buffer_minutes_snapshot integer not null check (buffer_minutes_snapshot >= 0),
  status public.booking_status not null default 'pending_payment',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_service_belongs_to_provider
    foreign key (provider_id, service_id)
    references public.services (provider_id, id) on delete restrict,
  constraint bookings_interval_order check (
    starts_at < ends_at and ends_at <= occupied_until
  ),
  constraint bookings_snapshot_deposit_not_above_price check (
    deposit_cents_snapshot <= price_cents_snapshot
  ),
  constraint bookings_pending_requires_expiration check (
    status not in ('pending_payment', 'pending_review') or expires_at is not null
  ),
  constraint bookings_no_overlapping_active_intervals
    exclude using gist (
      provider_id with =,
      tstzrange(starts_at, occupied_until, '[)') with &&
    )
    where (status in ('pending_payment', 'pending_review', 'confirmed'))
);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users (id) on delete set null,
  source text not null,
  reason text,
  external_event_id text,
  payload_version integer not null default 1 check (payload_version > 0),
  created_at timestamptz not null default now(),
  unique (source, external_event_id)
);

create index bookings_provider_start_idx
  on public.bookings (provider_id, starts_at);

create index bookings_customer_start_idx
  on public.bookings (customer_id, starts_at);

create index availability_rules_provider_day_idx
  on public.availability_rules (provider_id, day_of_week);

create index availability_exceptions_provider_date_idx
  on public.availability_exceptions (provider_id, exception_date);

-- RLS is enabled on every application table.
alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "providers_read_published_or_owned"
  on public.providers for select
  using (is_published or owner_id = (select auth.uid()));

create policy "providers_insert_own"
  on public.providers for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "providers_update_own"
  on public.providers for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "services_read_active_published_or_owned"
  on public.services for select
  using (
    (is_active and exists (
      select 1 from public.providers p
      where p.id = provider_id and p.is_published
    ))
    or exists (
      select 1 from public.providers p
      where p.id = provider_id and p.owner_id = (select auth.uid())
    )
  );

create policy "services_insert_provider_owner"
  on public.services for insert to authenticated
  with check (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ));

create policy "services_update_provider_owner"
  on public.services for update to authenticated
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ));

create policy "services_delete_provider_owner"
  on public.services for delete to authenticated
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ));

create policy "availability_rules_read_published_or_owned"
  on public.availability_rules for select
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id
      and (p.is_published or p.owner_id = (select auth.uid()))
  ));

create policy "availability_rules_manage_provider_owner"
  on public.availability_rules for all to authenticated
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ));

create policy "availability_exceptions_read_published_or_owned"
  on public.availability_exceptions for select
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id
      and (p.is_published or p.owner_id = (select auth.uid()))
  ));

create policy "availability_exceptions_manage_provider_owner"
  on public.availability_exceptions for all to authenticated
  using (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.providers p
    where p.id = provider_id and p.owner_id = (select auth.uid())
  ));

create policy "bookings_read_customer_or_provider_owner"
  on public.bookings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (
      select 1 from public.providers p
      where p.id = provider_id and p.owner_id = (select auth.uid())
    )
  );

create policy "bookings_insert_customer_for_published_service"
  on public.bookings for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1
      from public.providers p
      join public.services s on s.provider_id = p.id
      where p.id = provider_id
        and p.is_published
        and s.id = service_id
        and s.is_active
    )
  );

create policy "booking_events_read_booking_participants"
  on public.booking_events for select to authenticated
  using (exists (
    select 1 from public.bookings b
    left join public.providers p on p.id = b.provider_id
    where b.id = booking_id
      and (b.customer_id = (select auth.uid()) or p.owner_id = (select auth.uid()))
  ));

-- No client-side update/delete policies for bookings or booking_events.
-- State transitions must be exposed through authorized server-side operations.
