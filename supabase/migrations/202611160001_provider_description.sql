alter table public.providers
  add column if not exists description text;

alter table public.providers
  add constraint providers_description_length_check
  check (description is null or char_length(description) <= 180);
