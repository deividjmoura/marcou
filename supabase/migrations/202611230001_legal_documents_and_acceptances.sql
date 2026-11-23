-- Versioned legal documents and immutable user acceptance receipts.
--
-- The seeded 0.1 documents are drafts and deliberately do NOT require
-- acceptance. A later, legally reviewed migration must publish a new version
-- (or an unchanged reviewed version with an appropriate version identifier),
-- retire the previous published version atomically and opt into acceptance.

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null,
  version text not null,
  title text not null,
  public_path text not null,
  status text not null default 'draft',
  content_sha256 text not null,
  requires_acceptance boolean not null default false,
  material_change_summary text not null,
  published_at timestamptz,
  effective_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint legal_documents_key_format
    check (document_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint legal_documents_version_length
    check (length(version) between 1 and 40),
  constraint legal_documents_title_length
    check (length(title) between 1 and 120),
  constraint legal_documents_public_path
    check (public_path ~ '^/[a-z0-9][a-z0-9/-]*$'),
  constraint legal_documents_status
    check (status in ('draft', 'published', 'retired')),
  constraint legal_documents_hash_format
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint legal_documents_material_summary_length
    check (length(material_change_summary) between 1 and 1000),
  constraint legal_documents_draft_not_required
    check (status <> 'draft' or not requires_acceptance),
  constraint legal_documents_publication_dates
    check (
      (status = 'draft' and published_at is null and effective_at is null and retired_at is null)
      or
      (status = 'published' and published_at is not null and effective_at is not null and retired_at is null)
      or
      (status = 'retired' and published_at is not null and effective_at is not null and retired_at is not null)
    ),
  constraint legal_documents_effective_after_publication
    check (effective_at is null or published_at is null or effective_at >= published_at),
  constraint legal_documents_retired_after_publication
    check (retired_at is null or published_at is null or retired_at >= published_at),
  unique (document_key, version),
  unique (id, document_key, version, content_sha256)
);

-- Exactly one current published version per document key. Replacing a current
-- version must retire it and publish its successor in the same transaction.
create unique index legal_documents_one_published_per_key
  on public.legal_documents (document_key)
  where status = 'published';

create index legal_documents_current_required_idx
  on public.legal_documents (effective_at, document_key)
  where status = 'published' and requires_acceptance;

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  document_key text not null,
  document_version text not null,
  content_sha256 text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'web',
  constraint legal_acceptances_document_snapshot
    foreign key (document_id, document_key, document_version, content_sha256)
    references public.legal_documents (id, document_key, version, content_sha256)
    on delete restrict,
  constraint legal_acceptances_source
    check (source in ('web')),
  unique (user_id, document_id)
);

create index legal_acceptances_user_time_idx
  on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

-- Metadata is intentionally public. The canonical text is shipped by the app;
-- this table lets clients and auditors verify version/hash/status.
create policy "legal_documents_read_metadata"
  on public.legal_documents for select
  using (true);

create policy "legal_acceptances_read_own"
  on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.legal_documents (
  document_key,
  version,
  title,
  public_path,
  status,
  content_sha256,
  requires_acceptance,
  material_change_summary
) values
  (
    'terms',
    '0.1-draft',
    'Termos de Uso',
    '/termos',
    'draft',
    'e62a25cdcd88ce7dd71752693875b8bbae446ee0fa4b06479f44b929eb68838d',
    false,
    'Primeira minuta adaptada ao funcionamento atual do Marcou e ao roadmap Marcou Social.'
  ),
  (
    'privacy',
    '0.1-draft',
    'Política de Privacidade',
    '/privacidade',
    'draft',
    'eab1f9f338729df0fd29e4b43cb54a55c0550bb4f824fd11e1f21d5a7cdec951',
    false,
    'Primeiro inventário público em formato de minuta, limitado aos fluxos presentes no repositório Marcou.'
  ),
  (
    'community_guidelines',
    '0.1-draft',
    'Diretrizes da Comunidade',
    '/diretrizes-da-comunidade',
    'draft',
    'cfe6e756920f59c19f4e11463ff9ad8a91e8df16baa7b0d92bd125124ad6cf88',
    false,
    'Primeira minuta de regras de convivência e segurança para o Marcou Social.'
  ),
  (
    'content_reviews_policy',
    '0.1-draft',
    'Política de Conteúdo e Avaliações',
    '/politica-de-conteudo-e-avaliacoes',
    'draft',
    '2167957b650b6b9598ae3a73303e0a20add062c694117e1a9a42e85e4a62ca1b',
    false,
    'Primeira minuta para perfil, catálogo, portfólio, posts e avaliações verificadas.'
  );

create or replace function public.has_current_legal_acceptances()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    auth.uid() is not null
    and not exists (
      select 1
      from public.legal_documents d
      where d.status = 'published'
        and d.requires_acceptance
        and d.effective_at <= statement_timestamp()
        and not exists (
          select 1
          from public.legal_acceptances a
          where a.user_id = auth.uid()
            and a.document_id = d.id
            and a.document_key = d.document_key
            and a.document_version = d.version
            and a.content_sha256 = d.content_sha256
        )
    );
$$;

create or replace function public.get_pending_legal_documents()
returns table (
  document_id uuid,
  document_key text,
  document_version text,
  title text,
  public_path text,
  content_sha256 text,
  material_change_summary text,
  effective_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    d.id,
    d.document_key,
    d.version,
    d.title,
    d.public_path,
    d.content_sha256,
    d.material_change_summary,
    d.effective_at
  from public.legal_documents d
  where auth.uid() is not null
    and d.status = 'published'
    and d.requires_acceptance
    and d.effective_at <= statement_timestamp()
    and not exists (
      select 1
      from public.legal_acceptances a
      where a.user_id = auth.uid()
        and a.document_id = d.id
        and a.document_key = d.document_key
        and a.document_version = d.version
        and a.content_sha256 = d.content_sha256
    )
  order by d.document_key;
$$;

create or replace function public.record_legal_acceptances(p_documents jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_document public.legal_documents%rowtype;
  v_accepted integer := 0;
  v_row_count integer;
  v_expected_count integer;
  v_distinct_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  if p_documents is null
    or jsonb_typeof(p_documents) <> 'array'
    or jsonb_array_length(p_documents) = 0
    or jsonb_array_length(p_documents) > 10
  then
    raise exception using errcode = 'P0001', message = 'invalid_legal_acceptance_payload';
  end if;

  select count(*)
    into v_expected_count
    from public.legal_documents d
    where d.status = 'published'
      and d.requires_acceptance
      and d.effective_at <= statement_timestamp()
      and not exists (
        select 1
        from public.legal_acceptances a
        where a.user_id = v_user_id
          and a.document_id = d.id
          and a.document_key = d.document_key
          and a.document_version = d.version
          and a.content_sha256 = d.content_sha256
      );

  select count(distinct concat_ws(
      ':',
      value ->> 'documentKey',
      value ->> 'version',
      value ->> 'contentHash'
    ))
    into v_distinct_count
    from jsonb_array_elements(p_documents);

  -- Uma repetição idempotente do mesmo conjunto continua válida depois que já
  -- não há pendências; fora disso, o payload deve ser o conjunto pendente exato.
  if (v_expected_count > 0 and (
      jsonb_array_length(p_documents) <> v_expected_count
      or v_distinct_count <> v_expected_count
    ))
    or (v_expected_count = 0 and v_distinct_count <> jsonb_array_length(p_documents))
  then
    raise exception using errcode = 'P0001', message = 'legal_acceptance_set_mismatch';
  end if;

  for v_item in select value from jsonb_array_elements(p_documents)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or nullif(v_item ->> 'documentKey', '') is null
      or nullif(v_item ->> 'version', '') is null
      or (v_item ->> 'contentHash') !~ '^[0-9a-f]{64}$'
    then
      raise exception using errcode = 'P0001', message = 'invalid_legal_acceptance_payload';
    end if;

    select d.*
      into v_document
      from public.legal_documents d
      where d.document_key = v_item ->> 'documentKey'
        and d.version = v_item ->> 'version'
        and d.content_sha256 = v_item ->> 'contentHash'
        and d.status = 'published'
        and d.requires_acceptance
        and d.effective_at <= statement_timestamp();

    if not found then
      raise exception using errcode = 'P0001', message = 'legal_document_not_current';
    end if;

    insert into public.legal_acceptances (
      user_id,
      document_id,
      document_key,
      document_version,
      content_sha256,
      source
    ) values (
      v_user_id,
      v_document.id,
      v_document.document_key,
      v_document.version,
      v_document.content_sha256,
      'web'
    )
    on conflict (user_id, document_id) do nothing;

    get diagnostics v_row_count = row_count;
    v_accepted := v_accepted + v_row_count;
  end loop;

  return v_accepted;
end;
$$;

revoke all on table public.legal_documents from public, anon, authenticated;
revoke all on table public.legal_acceptances from public, anon, authenticated;
grant select on table public.legal_documents to anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
grant all on table public.legal_documents, public.legal_acceptances to service_role;

revoke all on function public.has_current_legal_acceptances() from public;
revoke all on function public.get_pending_legal_documents() from public;
revoke all on function public.record_legal_acceptances(jsonb) from public;
grant execute on function public.has_current_legal_acceptances() to authenticated;
grant execute on function public.get_pending_legal_documents() to authenticated;
grant execute on function public.record_legal_acceptances(jsonb) to authenticated;

comment on table public.legal_documents is
  'Version/hash metadata for legal and community documents. Drafts never require acceptance.';
comment on table public.legal_acceptances is
  'Immutable receipt of the exact document version/hash explicitly accepted by a user.';
comment on function public.record_legal_acceptances(jsonb) is
  'Records only exact, current, effective documents that explicitly require acceptance.';
