-- Private navigation preference for the account's customer/provider areas.
-- This preference is never an authorization claim: professional access continues
-- to derive only from providers.owner_id = auth.uid().

create table public.account_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferred_mode text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_preferences_mode_check
    check (preferred_mode in ('customer', 'provider'))
);

alter table public.account_preferences enable row level security;

create policy "account_preferences_read_own"
  on public.account_preferences for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes go through a narrowly scoped RPC so the actor and professional
-- ownership are derived in PostgreSQL, never from a browser-supplied user ID.
revoke all on table public.account_preferences from public, anon, authenticated;
grant select on table public.account_preferences to authenticated;
grant all on table public.account_preferences to service_role;

create or replace function public.get_preferred_mode()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_mode text;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  -- A stored preference is not authorization and cannot activate a provider
  -- area after the caller loses ownership of every provider.
  if not exists (
    select 1
      from public.providers p
     where p.owner_id = v_actor
  ) then
    return 'customer';
  end if;

  select preferred_mode
    into v_mode
    from public.account_preferences
   where user_id = v_actor;

  return coalesce(v_mode, 'customer');
end;
$$;

revoke all on function public.get_preferred_mode() from public, anon;
grant execute on function public.get_preferred_mode() to authenticated;

create or replace function public.set_preferred_mode(p_mode text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  if p_mode is null or p_mode not in ('customer', 'provider') then
    raise exception using errcode = 'P0001', message = 'invalid_preferred_mode';
  end if;

  if p_mode = 'provider' and not exists (
    select 1
      from public.providers p
     where p.owner_id = v_actor
  ) then
    raise exception using errcode = 'P0001', message = 'provider_required';
  end if;

  insert into public.account_preferences (
    user_id,
    preferred_mode,
    updated_at
  ) values (
    v_actor,
    p_mode,
    now()
  )
  on conflict (user_id) do update
    set preferred_mode = excluded.preferred_mode,
        updated_at = now();

  return p_mode;
end;
$$;

revoke all on function public.set_preferred_mode(text) from public, anon;
grant execute on function public.set_preferred_mode(text) to authenticated;

comment on table public.account_preferences is
  'Private per-user navigation preference; it does not grant professional authorization.';
comment on function public.get_preferred_mode() is
  'Returns only the caller’s effective navigation mode; without an owned provider the result is customer.';
comment on function public.set_preferred_mode(text) is
  'Sets the caller’s navigation preference after deriving the actor and provider ownership from auth.uid().';
