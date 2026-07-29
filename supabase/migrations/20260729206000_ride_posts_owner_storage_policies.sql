-- Allow authors to SELECT/DELETE their own ride-post objects by path.
-- storage.remove() requires both SELECT and DELETE; the member-gated helper
-- alone can silently no-op, which left files behind after post delete.

create or replace function public.is_own_ride_post_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
begin
  -- Path shape: {rideId}/{userId}/{postId}.jpg
  parts := string_to_array(p_object_name, '/');
  if array_length(parts, 1) <> 3 or auth.uid() is null then
    return false;
  end if;
  return lower(parts[2]) = auth.uid()::text;
end;
$$;

revoke all on function public.is_own_ride_post_object(text) from public, anon;
grant execute on function public.is_own_ride_post_object(text) to authenticated;

drop policy if exists ride_posts_select_own_object on storage.objects;
create policy ride_posts_select_own_object
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.is_own_ride_post_object(name)
);

drop policy if exists ride_posts_delete_own_object on storage.objects;
create policy ride_posts_delete_own_object
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.is_own_ride_post_object(name)
);
