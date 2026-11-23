-- Marcou Social rollout foundation (#82).
--
-- Feature flags are release controls, never authorization controls. Every
-- protected operation must still validate auth.uid(), ownership and RLS.
-- Configuration is private and defaults to fail-closed.

create table public.app_runtime_config (
  singleton boolean primary key default true check (singleton),
  deployment_environment text not null default 'local'
    check (deployment_environment in ('local', 'test', 'preview', 'staging', 'production')),
  updated_at timestamptz not null default now()
);

insert into public.app_runtime_config (singleton, deployment_environment)
values (true, 'local')
on conflict (singleton) do nothing;

create table public.feature_flags (
  flag_key text primary key
    check (flag_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  description text not null
    check (char_length(btrim(description)) between 8 and 240),
  is_enabled boolean not null default false,
  enabled_environments text[] not null default '{}'::text[]
    check (
      enabled_environments <@ array['local', 'test', 'preview', 'staging', 'production']::text[]
      and array_position(enabled_environments, null) is null
    ),
  rollout_percentage smallint not null default 0
    check (rollout_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.feature_flags (flag_key) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete cascade,
  is_enabled boolean not null,
  reason text not null check (char_length(btrim(reason)) between 8 and 500),
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flag_override_one_subject check (
    num_nonnulls(user_id, provider_id) = 1
  ),
  constraint feature_flag_override_expiration_order check (
    expires_at is null or expires_at > created_at
  )
);

create unique index feature_flag_overrides_user_unique
  on public.feature_flag_overrides (flag_key, user_id)
  where user_id is not null;

create unique index feature_flag_overrides_provider_unique
  on public.feature_flag_overrides (flag_key, provider_id)
  where provider_id is not null;

create index feature_flag_overrides_active_expiration_idx
  on public.feature_flag_overrides (flag_key, expires_at)
  where expires_at is not null;

alter table public.app_runtime_config enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_overrides enable row level security;

-- No anon/authenticated policies are intentional: configuration is not a
-- browser-readable API. SECURITY DEFINER evaluators expose only a boolean.
revoke all on table public.app_runtime_config from public, anon, authenticated;
revoke all on table public.feature_flags from public, anon, authenticated;
revoke all on table public.feature_flag_overrides from public, anon, authenticated;

grant all on table public.app_runtime_config to service_role;
grant all on table public.feature_flags to service_role;
grant all on table public.feature_flag_overrides to service_role;

insert into public.feature_flags (flag_key, description)
values
  ('social_profile', 'Perfil profissional social e fluxo de publicação.'),
  ('social_discovery', 'Busca, filtros e experiência pública de descoberta.'),
  ('social_content', 'Posts, grafo social, interações e feed.'),
  ('social_requests', 'Solicitações, propostas e integração com contratação.'),
  ('social_messaging', 'Conversas e mensagens vinculadas a contexto autorizado.'),
  ('social_reviews', 'Avaliações mútuas e reputação verificável.'),
  ('social_moderation', 'Denúncias, moderação, sanções e ferramentas operacionais.')
on conflict (flag_key) do nothing;

create or replace function public.is_feature_enabled(
  p_flag_key text,
  p_provider_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_environment text;
  v_flag public.feature_flags%rowtype;
  v_override boolean;
  v_subject_id uuid;
  v_bucket integer;
begin
  if v_actor_id is null or p_flag_key is null then
    return false;
  end if;

  select deployment_environment
    into v_environment
    from public.app_runtime_config
   where singleton = true;

  select *
    into v_flag
    from public.feature_flags
   where flag_key = p_flag_key;

  if not found
     or v_environment is null
     or not v_flag.is_enabled
     or not (v_environment = any(v_flag.enabled_environments)) then
    return false;
  end if;

  if p_provider_id is not null then
    if not exists (
      select 1
        from public.providers
       where id = p_provider_id
         and owner_id = v_actor_id
    ) then
      return false;
    end if;

    select is_enabled
      into v_override
      from public.feature_flag_overrides
     where flag_key = p_flag_key
       and provider_id = p_provider_id
       and (expires_at is null or expires_at > statement_timestamp());

    if found then
      return v_override;
    end if;
  end if;

  select is_enabled
    into v_override
    from public.feature_flag_overrides
   where flag_key = p_flag_key
     and user_id = v_actor_id
     and (expires_at is null or expires_at > statement_timestamp());

  if found then
    return v_override;
  end if;

  if v_flag.rollout_percentage = 0 then
    return false;
  end if;

  if v_flag.rollout_percentage = 100 then
    return true;
  end if;

  v_subject_id := coalesce(p_provider_id, v_actor_id);
  v_bucket := (
    ('x' || substr(md5(p_flag_key || ':' || v_subject_id::text), 1, 8))::bit(32)::bigint % 100
  )::integer;

  return v_bucket < v_flag.rollout_percentage;
end;
$$;

-- Anonymous public surfaces are enabled only at 100%. A browser-provided
-- cookie/header is deliberately not accepted as cohort authority.
create or replace function public.is_public_feature_enabled(p_flag_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select flag.is_enabled
       and config.deployment_environment = any(flag.enabled_environments)
       and flag.rollout_percentage = 100
      from public.feature_flags flag
      cross join public.app_runtime_config config
     where flag.flag_key = p_flag_key
       and config.singleton = true
  ), false);
$$;

revoke all on function public.is_feature_enabled(text, uuid) from public, anon;
revoke all on function public.is_public_feature_enabled(text) from public;

grant execute on function public.is_feature_enabled(text, uuid)
  to authenticated, service_role;
grant execute on function public.is_public_feature_enabled(text)
  to anon, authenticated, service_role;

comment on table public.app_runtime_config is
  'Private per-project runtime environment used by server-side rollout evaluation.';
comment on table public.feature_flags is
  'Private release controls. Flags never replace authorization or RLS.';
comment on table public.feature_flag_overrides is
  'Private expiring rollout overrides for one authenticated user or owned provider.';
comment on function public.is_feature_enabled(text, uuid) is
  'Fail-closed account/provider rollout evaluation; actor always derives from auth.uid().';
comment on function public.is_public_feature_enabled(text) is
  'Fail-closed public rollout evaluation; true only for a full 100 percent rollout.';
