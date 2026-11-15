-- Multi-service bookings (Issue #21).
-- Additive: keeps existing single-service bookings working.
-- - booking_services junction stores every service on a booking with snapshots.
-- - bookings.service_id remains the primary/first service for FK compatibility.
-- - Aggregated duration/price/deposit/buffer stay on bookings snapshots.
-- - create_booking accepts a single service_id (legacy) or service_ids array.
-- Do NOT apply this migration to remote Supabase without explicit owner approval.

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  service_id uuid not null,
  position integer not null check (position >= 0),
  service_name_snapshot text not null,
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0),
  deposit_cents_snapshot integer not null check (deposit_cents_snapshot >= 0),
  buffer_minutes_snapshot integer not null check (buffer_minutes_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint booking_services_unique_position unique (booking_id, position),
  constraint booking_services_unique_service unique (booking_id, service_id),
  constraint booking_services_service_fk
    foreign key (service_id) references public.services (id) on delete restrict
);

-- Full file continues in subsequent updates if truncated; see agent local work.
