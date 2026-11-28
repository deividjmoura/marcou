/**
 * Minimal Supabase Storage schema for PostgreSQL integration harnesses.
 * This intentionally models only buckets/objects RLS metadata, not the Storage
 * HTTP service, object engine, CDN, transforms or upload pipeline.
 */
export async function bootstrapStorageHarness(db) {
  await db.query(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null,
      owner_id uuid,
      created_at timestamptz not null default now(),
      unique (bucket_id, name)
    );
    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select case
        when position('/' in name) = 0 then '{}'::text[]
        else string_to_array(regexp_replace(name, '/[^/]+$', ''), '/')
      end
    $$;
    create or replace function storage.filename(name text)
    returns text
    language sql
    immutable
    as $$
      select regexp_replace(name, '^.*/', '')
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
}
