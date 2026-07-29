-- Last remaining creator may SELECT/DELETE every object under the ride path
-- so the client can purge files via the Storage API before delete_ride.
-- (SQL deletes on storage.objects only drop metadata and orphan the real files.)

create or replace function public.can_purge_ride_post_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
  path_ride_id uuid;
  member_count integer;
begin
  parts := string_to_array(p_object_name, '/');
  if array_length(parts, 1) < 1 or auth.uid() is null then
    return false;
  end if;

  begin
    path_ride_id := parts[1]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if not public.is_ride_creator(path_ride_id, auth.uid()) then
    return false;
  end if;

  select count(*)::integer
    into member_count
  from public.ride_members
  where ride_id = path_ride_id;

  return member_count = 1;
end;
$$;

revoke all on function public.can_purge_ride_post_object(text) from public, anon;
grant execute on function public.can_purge_ride_post_object(text) to authenticated;

drop policy if exists ride_posts_select_purge_object on storage.objects;
create policy ride_posts_select_purge_object
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.can_purge_ride_post_object(name)
);

drop policy if exists ride_posts_delete_purge_object on storage.objects;
create policy ride_posts_delete_purge_object
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.can_purge_ride_post_object(name)
);

-- Cron/SQL storage.objects deletes do not remove the real file. Only clear
-- expired temporary post rows; clients purge files through the Storage API.
create or replace function public.cleanup_expired_temporary_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.posts
  where is_temporary = true
    and expires_at <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- delete_ride: DB cascade only. Client removes Storage files first via API.
create or replace function public.delete_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may delete this ride' using errcode = '42501';
  end if;

  select count(*)::integer
    into member_count
  from public.ride_members
  where ride_id = p_ride_id;

  if member_count <> 1 then
    raise exception 'Ride can only be deleted when you are the last member' using errcode = '22023';
  end if;

  delete from public.rides
  where id = p_ride_id;
end;
$$;
