-- Public avatars bucket: path `{userId}/avatar.jpg`. Owners write; public read via URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.is_own_avatar_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_object_name = auth.uid()::text || '/avatar.jpg';
$$;

create policy avatars_select_public
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and public.is_own_avatar_object(name)
);

create policy avatars_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and public.is_own_avatar_object(name)
)
with check (
  bucket_id = 'avatars'
  and public.is_own_avatar_object(name)
);

create policy avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and public.is_own_avatar_object(name)
);
