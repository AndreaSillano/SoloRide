begin;

-- preview_ride_by_code() and join_ride_by_code() compared the ride's start/end
-- dates against Postgres's `current_date`, which is evaluated in the
-- database's session timezone (UTC on Supabase). A ride that has already
-- started in the user's local timezone could still read as "upcoming" (or a
-- ride that has ended locally could still read as "active") whenever the
-- user's local date has rolled over but UTC hasn't yet, or vice versa.
-- Both functions now take the caller's local date as an explicit parameter
-- instead of relying on the server's notion of "today".

drop function if exists public.preview_ride_by_code(text);
drop function if exists public.join_ride_by_code(text);

create function public.preview_ride_by_code(p_code text, p_local_date date)
returns table (
  status text,
  id uuid,
  name text,
  description text,
  start_date date,
  end_date date,
  member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select
      rides.id,
      rides.name,
      rides.description,
      rides.start_date,
      rides.end_date,
      rides.is_archived,
      count(members.id) as member_count
    from public.rides as rides
    left join public.ride_members as members on members.ride_id = rides.id
    where rides.code = upper(btrim(p_code))
      and auth.uid() is not null
    group by rides.id
  )
  select
    case
      when target.is_archived then 'archived'
      when p_local_date < target.start_date then 'upcoming'
      when p_local_date > target.end_date then 'expired'
      else 'active'
    end,
    target.id,
    target.name,
    target.description,
    target.start_date,
    target.end_date,
    target.member_count
  from target
  union all
  select
    'invalid',
    null::uuid,
    null::text,
    null::text,
    null::date,
    null::date,
    0::bigint
  where auth.uid() is not null
    and not exists (select 1 from target);
$$;

create function public.join_ride_by_code(p_code text, p_local_date date)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_ride public.rides;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into target_ride
  from public.rides
  where code = upper(btrim(p_code))
  for update;

  if not found then
    raise exception 'Ride code not found' using errcode = 'P0002';
  end if;
  if target_ride.is_archived then
    raise exception 'Ride is archived' using errcode = '22023';
  end if;
  if p_local_date < target_ride.start_date then
    raise exception 'Ride has not started' using errcode = '22023';
  end if;
  if p_local_date > target_ride.end_date then
    raise exception 'Ride has expired' using errcode = '22023';
  end if;
  if public.is_ride_member(target_ride.id, current_user_id) then
    raise exception 'Already a ride member' using errcode = '23505';
  end if;

  insert into public.ride_members (ride_id, user_id, role)
  values (target_ride.id, current_user_id, 'member');

  return target_ride;
end;
$$;

revoke execute on function public.preview_ride_by_code(text, date) from public, anon;
revoke execute on function public.join_ride_by_code(text, date) from public, anon;
grant execute on function public.preview_ride_by_code(text, date) to authenticated;
grant execute on function public.join_ride_by_code(text, date) to authenticated;

commit;
