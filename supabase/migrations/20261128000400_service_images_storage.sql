-- Optional public images for provider services. Storage remains owner-scoped for writes.
-- Public read is intentional: these images are shown on published booking pages.
alter table public.services
  add column image_path text;

alter table public.services
  add constraint services_image_path_format
  check (
    image_path is null
    or image_path ~* '^providers/[0-9a-f-]{36}/services/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-images',
  'service-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "service_images_public_read"
  on storage.objects for select to anon, authenticated
  using (storage.objects.bucket_id = 'service-images');

create policy "service_images_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'services'
    and (storage.foldername(storage.objects.name))[4] ~* '^[0-9a-f-]{36}$'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      join public.services s on s.provider_id = p.id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and s.id::text = (storage.foldername(storage.objects.name))[4]
        and p.owner_id = (select auth.uid())
    )
  );

create policy "service_images_owner_update"
  on storage.objects for update to authenticated
  using (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'services'
    and (storage.foldername(storage.objects.name))[4] ~* '^[0-9a-f-]{36}$'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      join public.services s on s.provider_id = p.id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and s.id::text = (storage.foldername(storage.objects.name))[4]
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'services'
    and (storage.foldername(storage.objects.name))[4] ~* '^[0-9a-f-]{36}$'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      join public.services s on s.provider_id = p.id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and s.id::text = (storage.foldername(storage.objects.name))[4]
        and p.owner_id = (select auth.uid())
    )
  );

create policy "service_images_owner_delete"
  on storage.objects for delete to authenticated
  using (
    storage.objects.bucket_id = 'service-images'
    and (storage.foldername(storage.objects.name))[1] = 'providers'
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(storage.objects.name))[3] = 'services'
    and (storage.foldername(storage.objects.name))[4] ~* '^[0-9a-f-]{36}$'
    and storage.filename(storage.objects.name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and exists (
      select 1
      from public.providers p
      join public.services s on s.provider_id = p.id
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and s.id::text = (storage.foldername(storage.objects.name))[4]
        and p.owner_id = (select auth.uid())
    )
  );
