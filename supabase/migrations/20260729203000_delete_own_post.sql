-- Delete a post and its storage object in one privileged step.
-- Client storage.remove() needs SELECT+DELETE RLS; SELECT requires the posts
-- row to still exist, so a client-side "delete row then file" flow orphans files.

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

  -- Storage RLS can reject deletes from non-storage owners; never block the
  -- posts-row delete on that. Prefer bypassing RLS when the role allows it.
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
