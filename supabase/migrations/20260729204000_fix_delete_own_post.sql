-- Fix delete_own_post: storage.objects RLS can abort a security-definer
-- delete for non-storage owners. Remove the file best-effort, always delete
-- the posts row after authorship is verified. Also relax storage SELECT so
-- authors can resolve their own objects (required for client remove).

create or replace function public.delete_own_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_path text;
  target_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select image_path, user_id
    into target_path, target_user
  from public.posts
  where id = p_post_id
  for update;

  if target_user is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if target_user is distinct from auth.uid() then
    raise exception 'Only the author may delete this post' using errcode = '42501';
  end if;

  -- Match delete_ride / cleanup_expired: storage cleanup must not block
  -- removing the posts row. Prefer bypassing RLS when the role allows it.
  begin
    perform set_config('row_security', 'off', true);
    delete from storage.objects
    where bucket_id = 'ride-posts'
      and name = target_path;
  exception
    when others then
      begin
        delete from storage.objects
        where bucket_id = 'ride-posts'
          and name = target_path;
      exception
        when others then
          null;
      end;
  end;

  delete from public.posts
  where id = p_post_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_own_post(uuid) from public, anon;
grant execute on function public.delete_own_post(uuid) to authenticated;

create or replace function public.can_access_ride_post_object(
  p_object_name text,
  p_operation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  path_ride_id uuid;
  path_user_id uuid;
  path_post_id uuid;
  matching_post_exists boolean;
begin
  path_parts := string_to_array(p_object_name, '/');
  if array_length(path_parts, 1) <> 3
     or path_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$' then
    return false;
  end if;

  path_ride_id := path_parts[1]::uuid;
  path_user_id := path_parts[2]::uuid;
  path_post_id := left(path_parts[3], -4)::uuid;

  if p_operation = 'insert' then
    return path_user_id = auth.uid()
      and public.is_ride_member(path_ride_id, auth.uid());
  end if;

  select exists (
    select 1
    from public.posts
    where id = path_post_id
      and ride_id = path_ride_id
      and user_id = path_user_id
      and image_path = p_object_name
  )
  into matching_post_exists;

  if p_operation = 'select' then
    -- Authors can always resolve their own objects so storage.remove works
    -- (it requires SELECT + DELETE). Members still need a matching post row.
    return public.is_ride_member(path_ride_id, auth.uid())
      and (matching_post_exists or path_user_id = auth.uid());
  end if;

  if p_operation = 'delete' then
    return path_user_id = auth.uid()
      and public.is_ride_member(path_ride_id, auth.uid());
  end if;

  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;
