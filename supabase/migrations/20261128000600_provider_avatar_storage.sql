-- Professional avatars reuse the public service-images bucket and validator.
-- Writes are scoped to providers.owner_id; public reads are intentional for public profiles.
alter table public.providers
  add column avatar_path text;

alter table public.providers
  add constraint providers_avatar_path_format
  check (
    avatar_path is null
    or avatar_path ~* (
      '^providers/' || id::text ||
      '/avatar/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    )
  );

create policy "provider_avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'avatar'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy "provider_avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'avatar'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'avatar'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

create policy "provider_avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'avatar'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and p.owner_id = (select auth.uid())
    )
  );
