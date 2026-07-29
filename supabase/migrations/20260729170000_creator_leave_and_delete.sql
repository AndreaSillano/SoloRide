-- Allow archived Ride creators to leave. If other members remain, ownership
-- transfers to the next member. If the creator is last, delete the Ride.

create or replace function public.leave_ride(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
  is_archived boolean;
  remaining_count integer;
  next_owner uuid;
begin
  select role
    into current_role
  from public.ride_members
  where ride_id = p_ride_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Ride membership not found' using errcode = 'P0002';
  end if;

  select rides.is_archived
    into is_archived
  from public.rides
  where id = p_ride_id;

  if not found then
    raise exception 'Ride not found' using errcode = 'P0002';
  end if;

  if current_role = 'creator' and not is_archived then
    raise exception 'Archive the ride before the creator can leave' using errcode = '42501';
  end if;

  select count(*)::integer
    into remaining_count
  from public.ride_members
  where ride_id = p_ride_id;

  -- Last member leaving an archived Ride must use delete_ride instead.
  if remaining_count <= 1 then
    raise exception 'Last member must delete the ride' using errcode = '22023';
  end if;

  if current_role = 'creator' then
    select user_id
      into next_owner
    from public.ride_members
    where ride_id = p_ride_id
      and user_id <> auth.uid()
    order by joined_at asc, user_id asc
    limit 1
    for update;

    if next_owner is null then
      raise exception 'Last member must delete the ride' using errcode = '22023';
    end if;

    delete from public.ride_members
    where ride_id = p_ride_id
      and user_id = auth.uid();

    update public.ride_members
    set role = 'creator'
    where ride_id = p_ride_id
      and user_id = next_owner;

    update public.rides
    set creator_id = next_owner
    where id = p_ride_id;
  else
    delete from public.ride_members
    where ride_id = p_ride_id
      and user_id = auth.uid();
  end if;

  return 'left';
end;
$$;

-- Permanently remove a Ride. Only the creator may do this, and only when they
-- are the sole remaining member (typically after archiving).
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

  -- Cascade removes schedule days, members, posts, and comments.
  -- Storage objects are cleaned up best-effort below.
  begin
    delete from storage.objects
    where bucket_id = 'ride-posts'
      and name like (p_ride_id::text || '/%');
  exception
    when others then
      null;
  end;

  delete from public.rides
  where id = p_ride_id;
end;
$$;

revoke execute on function public.leave_ride(uuid) from public, anon;
revoke execute on function public.delete_ride(uuid) from public, anon;
grant execute on function public.leave_ride(uuid) to authenticated;
grant execute on function public.delete_ride(uuid) to authenticated;
