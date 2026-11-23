-- Taxonomia, modalidades e áreas de atendimento do Marcou Social (#87).
--
-- Esta migration é aditiva e preserva clientes antigos: serviços existentes
-- recebem a categoria genérica publicada e atendimento no espaço profissional.
-- Endereços exatos não pertencem a este domínio e não são armazenados aqui.

create type public.service_category_status as enum (
  'draft',
  'published',
  'retired'
);

create type public.service_delivery_mode as enum (
  'provider_location',
  'customer_location',
  'remote'
);

create type public.service_area_precision as enum (
  'city',
  'neighborhood',
  'radius'
);

create type public.service_area_source as enum (
  'provider_declared',
  'ibge_catalog',
  'geocoded_approximate'
);

create type public.category_suggestion_status as enum (
  'pending',
  'approved',
  'rejected'
);

-- Chave determinística para aliases e filtros. Não tenta substituir o texto
-- exibido; serve somente para unicidade e consultas tolerantes a acentos.
create or replace function public.normalize_discovery_key(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(btrim(p_value)),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique
    check (stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  parent_id uuid references public.service_categories (id) on delete restrict,
  status public.service_category_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_not_own_parent
    check (parent_id is null or parent_id <> id)
);

create table public.service_category_versions (
  category_id uuid not null
    references public.service_categories (id) on delete cascade,
  version integer not null check (version > 0),
  name text not null
    check (char_length(btrim(name)) between 2 and 80),
  description text
    check (description is null or char_length(btrim(description)) between 8 and 240),
  is_current boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (category_id, version)
);

create unique index service_category_one_current_version_idx
  on public.service_category_versions (category_id)
  where is_current;

create unique index service_category_current_name_idx
  on public.service_category_versions (public.normalize_discovery_key(name))
  where is_current;

create table public.service_category_aliases (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null
    references public.service_categories (id) on delete cascade,
  locale text not null default 'pt-BR'
    check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  alias text not null
    check (char_length(btrim(alias)) between 2 and 80),
  normalized_alias text generated always as (
    public.normalize_discovery_key(alias)
  ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (locale, normalized_alias)
);

create table public.service_category_suggestions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  proposed_parent_id uuid references public.service_categories (id) on delete restrict,
  proposed_name text not null
    check (char_length(btrim(proposed_name)) between 2 and 80),
  normalized_name text generated always as (
    public.normalize_discovery_key(proposed_name)
  ) stored,
  rationale text not null
    check (char_length(btrim(rationale)) between 8 and 500),
  status public.category_suggestion_status not null default 'pending',
  submitted_by uuid not null default auth.uid()
    references auth.users (id) on delete restrict,
  moderation_note text
    check (
      moderation_note is null
      or char_length(btrim(moderation_note)) between 8 and 500
    ),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint category_suggestion_review_state check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

create unique index service_category_pending_suggestion_idx
  on public.service_category_suggestions (provider_id, normalized_name)
  where status = 'pending';

create table public.provider_service_areas (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  country_code text not null default 'BR'
    check (country_code ~ '^[A-Z]{2}$'),
  state_code text not null
    check (state_code ~ '^[A-Z]{2}$'),
  city_name text not null
    check (char_length(btrim(city_name)) between 2 and 80),
  city_key text generated always as (
    public.normalize_discovery_key(city_name)
  ) stored,
  ibge_city_code text
    check (ibge_city_code is null or ibge_city_code ~ '^[0-9]{7}$'),
  neighborhood_name text
    check (
      neighborhood_name is null
      or char_length(btrim(neighborhood_name)) between 2 and 80
    ),
  neighborhood_key text generated always as (
    case
      when neighborhood_name is null then null
      else public.normalize_discovery_key(neighborhood_name)
    end
  ) stored,
  precision public.service_area_precision not null,
  radius_km numeric(5, 1)
    check (radius_km is null or radius_km between 1 and 200),
  source public.service_area_source not null default 'provider_declared',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_area_shape check (
    (precision = 'city' and neighborhood_name is null and radius_km is null)
    or (
      precision = 'neighborhood'
      and neighborhood_name is not null
      and radius_km is null
    )
    or (precision = 'radius' and radius_km is not null)
  ),
  constraint provider_service_area_city_is_not_address check (
    city_name !~ '[[:digit:],;/#]'
    and city_key !~ '(^|-)(rua|r|avenida|av|avda|travessa|trav|rodovia|rod|estrada|estr|alameda|logradouro|servidao|viela|beco|quadra|lote|condominio)(-|$)'
  ),
  constraint provider_service_area_neighborhood_is_not_address check (
    neighborhood_name is null
    or (
      neighborhood_name !~ '[[:digit:],;/#]'
      and neighborhood_key !~ '(^|-)(rua|r|avenida|av|avda|travessa|trav|rodovia|rod|estrada|estr|alameda|logradouro|servidao|viela|beco|quadra|lote|condominio)(-|$)'
    )
  )
);

create unique index provider_service_area_unique_idx
  on public.provider_service_areas (
    provider_id,
    country_code,
    state_code,
    city_key,
    coalesce(neighborhood_key, ''),
    precision,
    coalesce(radius_km, 0::numeric)
  );

create index provider_service_area_owner_active_idx
  on public.provider_service_areas (provider_id, is_active);

create index provider_service_area_city_filter_idx
  on public.provider_service_areas (state_code, city_key, provider_id)
  where is_active;

create index provider_service_area_neighborhood_filter_idx
  on public.provider_service_areas (
    state_code,
    city_key,
    neighborhood_key,
    provider_id
  )
  where is_active and neighborhood_key is not null;

-- IDs estáveis permitem default/backfill sem depender de uma consulta em DEFAULT.
insert into public.service_categories (id, stable_key, parent_id, status)
values
  ('10000000-0000-4000-8000-000000000001', 'servicos-gerais', null, 'published'),
  ('10000000-0000-4000-8000-000000000010', 'beleza-bem-estar', null, 'published'),
  ('10000000-0000-4000-8000-000000000011', 'cabelo', '10000000-0000-4000-8000-000000000010', 'published'),
  ('10000000-0000-4000-8000-000000000012', 'unhas', '10000000-0000-4000-8000-000000000010', 'published'),
  ('10000000-0000-4000-8000-000000000020', 'casa-manutencao', null, 'published'),
  ('10000000-0000-4000-8000-000000000021', 'limpeza', '10000000-0000-4000-8000-000000000020', 'published'),
  ('10000000-0000-4000-8000-000000000022', 'reparos-instalacoes', '10000000-0000-4000-8000-000000000020', 'published'),
  ('10000000-0000-4000-8000-000000000030', 'educacao-aulas', null, 'published');

insert into public.service_category_versions (
  category_id,
  version,
  name,
  description,
  is_current
)
values
  ('10000000-0000-4000-8000-000000000001', 1, 'Serviços gerais', 'Categoria temporária para serviços que ainda serão classificados.', true),
  ('10000000-0000-4000-8000-000000000010', 1, 'Beleza e bem-estar', 'Cuidados pessoais, beleza e bem-estar.', true),
  ('10000000-0000-4000-8000-000000000011', 1, 'Cabelo', 'Cortes, tratamentos e cuidados com cabelo.', true),
  ('10000000-0000-4000-8000-000000000012', 1, 'Unhas', 'Manicure, pedicure e cuidados com unhas.', true),
  ('10000000-0000-4000-8000-000000000020', 1, 'Casa e manutenção', 'Serviços de cuidado, instalação e manutenção residencial.', true),
  ('10000000-0000-4000-8000-000000000021', 1, 'Limpeza', 'Limpeza e organização de ambientes.', true),
  ('10000000-0000-4000-8000-000000000022', 1, 'Reparos e instalações', 'Reparos, montagem e instalações em geral.', true),
  ('10000000-0000-4000-8000-000000000030', 1, 'Educação e aulas', 'Aulas, reforço e orientação educacional.', true);

insert into public.service_category_aliases (category_id, alias)
values
  ('10000000-0000-4000-8000-000000000001', 'geral'),
  ('10000000-0000-4000-8000-000000000010', 'beleza'),
  ('10000000-0000-4000-8000-000000000011', 'cabeleireiro'),
  ('10000000-0000-4000-8000-000000000012', 'manicure'),
  ('10000000-0000-4000-8000-000000000020', 'serviços para casa'),
  ('10000000-0000-4000-8000-000000000021', 'faxina'),
  ('10000000-0000-4000-8000-000000000022', 'manutenção'),
  ('10000000-0000-4000-8000-000000000030', 'aulas particulares');

alter table public.services
  add column category_id uuid;

update public.services
   set category_id = '10000000-0000-4000-8000-000000000001'
 where category_id is null;

alter table public.services
  alter column category_id set default '10000000-0000-4000-8000-000000000001',
  alter column category_id set not null,
  add constraint services_category_id_fkey
    foreign key (category_id)
    references public.service_categories (id)
    on delete restrict;

alter table public.services
  add column delivery_modes public.service_delivery_mode[] not null
    default array['provider_location'::public.service_delivery_mode],
  add constraint services_delivery_modes_not_empty
    check (cardinality(delivery_modes) between 1 and 3),
  add constraint services_delivery_modes_without_nulls
    check (array_position(delivery_modes, null) is null),
  add constraint services_delivery_modes_unique
    check (
      cardinality(delivery_modes) =
        case when 'provider_location' = any(delivery_modes) then 1 else 0 end
        + case when 'customer_location' = any(delivery_modes) then 1 else 0 end
        + case when 'remote' = any(delivery_modes) then 1 else 0 end
    );

create index services_category_active_idx
  on public.services (category_id, provider_id)
  where is_active;

create index services_delivery_modes_idx
  on public.services using gin (delivery_modes);

-- A categoria precisa estar publicada no momento da atribuição. Retirar uma
-- categoria do catálogo não apaga nem invalida serviços/reservas históricos.
-- Atendimento no cliente exige ao menos uma área ativa do mesmo prestador.
create or replace function public.validate_service_discovery_configuration()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Serializa alterações de modalidade com remoções da última área do mesmo
  -- prestador. Sem esse lock, duas transações concorrentes poderiam validar
  -- snapshots diferentes e confirmar um serviço móvel sem área ativa.
  perform provider.id
    from public.providers provider
   where provider.id = new.provider_id
   for update;

  if tg_op = 'INSERT'
     or new.category_id is distinct from old.category_id
     or (new.is_active and not old.is_active) then
    if not exists (
      select 1
        from public.service_categories category
        join public.service_category_versions version
          on version.category_id = category.id
         and version.is_current
       where category.id = new.category_id
         and category.status = 'published'
    ) then
      raise exception using
        errcode = '23514',
        message = 'service_category_not_published',
        constraint = 'services_published_category_check';
    end if;
  end if;

  if 'customer_location' = any(new.delivery_modes)
     and not exists (
       select 1
         from public.provider_service_areas area
        where area.provider_id = new.provider_id
          and area.is_active
     ) then
    raise exception using
      errcode = '23514',
      message = 'customer_location_requires_service_area',
      constraint = 'services_customer_location_area_check';
  end if;

  return new;
end;
$$;

create trigger services_validate_discovery_configuration
before insert or update of provider_id, category_id, delivery_modes, is_active
on public.services
for each row execute function public.validate_service_discovery_configuration();

-- Não permite remover/desativar a última área enquanto algum serviço ainda
-- anuncia atendimento no local do cliente.
create or replace function public.protect_last_customer_service_area()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_loses_active_area boolean;
begin
  -- Usa o mesmo lock da validação de serviços para manter a invariável também
  -- sob concorrência entre ativação de modalidade e remoção de área.
  perform provider.id
    from public.providers provider
   where provider.id = old.provider_id
   for update;

  v_loses_active_area := old.is_active and (
    tg_op = 'DELETE'
    or not new.is_active
    or new.provider_id is distinct from old.provider_id
  );

  if v_loses_active_area
     and not exists (
       select 1
         from public.provider_service_areas area
        where area.provider_id = old.provider_id
          and area.is_active
          and area.id <> old.id
     )
     and exists (
       select 1
         from public.services service
        where service.provider_id = old.provider_id
          and service.is_active
          and 'customer_location' = any(service.delivery_modes)
     ) then
    raise exception using
      errcode = '23514',
      message = 'service_area_in_use_by_customer_location',
      constraint = 'provider_service_area_in_use_check';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger provider_service_areas_protect_last_active
before delete or update of is_active, provider_id
on public.provider_service_areas
for each row execute function public.protect_last_customer_service_area();

alter table public.service_categories enable row level security;
alter table public.service_category_versions enable row level security;
alter table public.service_category_aliases enable row level security;
alter table public.service_category_suggestions enable row level security;
alter table public.provider_service_areas enable row level security;

create policy "service_categories_read_published"
  on public.service_categories for select
  using (status = 'published');

create policy "service_category_versions_read_current_published"
  on public.service_category_versions for select
  using (
    is_current
    and exists (
      select 1
        from public.service_categories category
       where category.id = category_id
         and category.status = 'published'
    )
  );

create policy "service_category_aliases_read_active_published"
  on public.service_category_aliases for select
  using (
    is_active
    and exists (
      select 1
        from public.service_categories category
       where category.id = category_id
         and category.status = 'published'
    )
  );

create policy "service_category_suggestions_read_own"
  on public.service_category_suggestions for select to authenticated
  using (
    submitted_by = (select auth.uid())
    and exists (
      select 1
        from public.providers provider
       where provider.id = provider_id
         and provider.owner_id = (select auth.uid())
    )
  );

create policy "service_category_suggestions_insert_own"
  on public.service_category_suggestions for insert to authenticated
  with check (
    status = 'pending'
    and submitted_by = (select auth.uid())
    and reviewed_at is null
    and reviewed_by is null
    and exists (
      select 1
        from public.providers provider
       where provider.id = provider_id
         and provider.owner_id = (select auth.uid())
    )
  );

create policy "provider_service_areas_read_own"
  on public.provider_service_areas for select to authenticated
  using (exists (
    select 1
      from public.providers provider
     where provider.id = provider_id
       and provider.owner_id = (select auth.uid())
  ));

create policy "provider_service_areas_insert_own"
  on public.provider_service_areas for insert to authenticated
  with check (
    country_code = 'BR'
    and source = 'provider_declared'
    and is_active
    and exists (
      select 1
        from public.providers provider
       where provider.id = provider_id
         and provider.owner_id = (select auth.uid())
    )
  );

create policy "provider_service_areas_update_own"
  on public.provider_service_areas for update to authenticated
  using (
    source = 'provider_declared'
    and exists (
      select 1
        from public.providers provider
       where provider.id = provider_id
         and provider.owner_id = (select auth.uid())
    )
  )
  with check (
    country_code = 'BR'
    and source = 'provider_declared'
    and exists (
      select 1
        from public.providers provider
       where provider.id = provider_id
         and provider.owner_id = (select auth.uid())
    )
  );

create policy "provider_service_areas_delete_own"
  on public.provider_service_areas for delete to authenticated
  using (exists (
    select 1
      from public.providers provider
     where provider.id = provider_id
       and provider.owner_id = (select auth.uid())
  ));

-- Catálogo atual para formulários. Versões antigas continuam preservadas nas
-- tabelas base, mas não fazem parte da projeção corrente.
create view public.service_category_catalog
with (security_invoker = true)
as
select
  category.id,
  category.parent_id,
  category.stable_key,
  version.version,
  version.name,
  version.description
from public.service_categories category
join public.service_category_versions version
  on version.category_id = category.id
 and version.is_current
where category.status = 'published';

-- Projeção pública deliberadamente pequena e condicionada ao rollout total.
-- Não retorna UUID interno de categoria, source, chaves normalizadas,
-- timestamps, endereço, CEP ou coordenada.
create or replace function public.get_public_provider_discovery(
  p_provider_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_id uuid;
  v_areas jsonb;
  v_services jsonb;
begin
  if p_provider_slug is null
     or char_length(p_provider_slug) not between 3 and 48
     or p_provider_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'
     or not public.is_public_feature_enabled('social_discovery') then
    return null;
  end if;

  select provider.id
    into v_provider_id
    from public.providers provider
   where provider.slug = p_provider_slug
     and provider.is_published;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stateCode', area.state_code,
        'city', area.city_name,
        'neighborhood', area.neighborhood_name,
        'precision', area.precision,
        'radiusKm', area.radius_km
      )
      order by area.state_code, area.city_key, area.neighborhood_key nulls first
    ),
    '[]'::jsonb
  )
    into v_areas
    from public.provider_service_areas area
   where area.provider_id = v_provider_id
     and area.is_active;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'serviceId', service.id,
        'category', jsonb_build_object(
          'slug', category.stable_key,
          'name', version.name,
          'version', version.version
        ),
        'deliveryModes', to_jsonb(service.delivery_modes)
      )
      order by service.name, service.id
    ),
    '[]'::jsonb
  )
    into v_services
    from public.services service
    join public.service_categories category
      on category.id = service.category_id
    join public.service_category_versions version
      on version.category_id = category.id
     and version.is_current
   where service.provider_id = v_provider_id
     and service.is_active;

  return jsonb_build_object(
    'serviceAreas', v_areas,
    'services', v_services
  );
end;
$$;

revoke all on table public.service_categories
  from public, anon, authenticated;
revoke all on table public.service_category_versions
  from public, anon, authenticated;
revoke all on table public.service_category_aliases
  from public, anon, authenticated;
revoke all on table public.service_category_suggestions
  from public, anon, authenticated;
revoke all on table public.provider_service_areas
  from public, anon, authenticated;
revoke all on table public.service_category_catalog
  from public, anon, authenticated;

-- Taxonomia publicada não contém PII e alimenta seletores/filtros públicos.
grant select on table public.service_categories,
  public.service_category_versions,
  public.service_category_aliases
  to anon, authenticated;
grant select on table public.service_category_catalog
  to anon, authenticated;

-- Gestão do prestador continua protegida por ownership e RLS.
grant select, insert on table public.service_category_suggestions
  to authenticated;
grant select, insert, update, delete on table public.provider_service_areas
  to authenticated;

grant all on table public.service_categories,
  public.service_category_versions,
  public.service_category_aliases,
  public.service_category_suggestions,
  public.provider_service_areas
  to service_role;
grant select on table public.service_category_catalog to service_role;

revoke all on function public.normalize_discovery_key(text) from public, anon;
grant execute on function public.normalize_discovery_key(text)
  to authenticated, service_role;

revoke all on function public.validate_service_discovery_configuration()
  from public, anon, authenticated;
revoke all on function public.protect_last_customer_service_area()
  from public, anon, authenticated;

revoke all on function public.get_public_provider_discovery(text) from public;
grant execute on function public.get_public_provider_discovery(text)
  to anon, authenticated, service_role;

comment on table public.service_categories is
  'Identidades estáveis da taxonomia; categorias são aposentadas, nunca apagadas quando referenciadas.';
comment on table public.service_category_versions is
  'Histórico versionado de nomes e descrições da taxonomia de serviços.';
comment on table public.service_category_suggestions is
  'Fila de sugestões; publicação exige moderação privilegiada posterior.';
comment on table public.provider_service_areas is
  'Áreas aproximadas sem rua, número, CEP ou coordenada residencial exata.';
comment on function public.get_public_provider_discovery(text) is
  'Projeção pública mínima de categoria, modalidade e área; exige rollout público total.';
