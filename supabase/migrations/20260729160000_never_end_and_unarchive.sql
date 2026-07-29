-- Open-ended rides (nullable end_date) + restore archived rides.

alter table public.rides
  alter column end_date drop not null;

alter table public.rides
  drop constraint if exists rides_date_order;

alter table public.rides
  add constraint rides_date_order
  check (end_date is null or end_date >= start_date);

-- Posting is allowed on/after start; end is optional for never-ending rides.
create or replace function public.validate_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride_start date;
  ride_end date;
begin
  select start_date, end_date
    into ride_start, ride_end
  from public.rides
  where id = new.ride_id;

  if ride_start is null then
    raise exception 'Ride not found' using errcode = '23503';
  end if;

  if new.scheduled_date < ride_start
     or (ride_end is not null and new.scheduled_date > ride_end) then
    raise exception 'Post date must be within ride dates' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.ride_schedule_days
    where ride_id = new.ride_id
      and weekday = extract(dow from new.scheduled_date)::smallint
  ) then
    raise exception 'Post date is not a scheduled ride weekday' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop function if exists public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean
);

create function public.create_ride(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null,
  p_strict_schedule boolean default true
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_ride public.rides;
  generated_code text;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date' using errcode = '22023';
  end if;

  if p_weekdays is null
     or cardinality(p_weekdays) not between 1 and 7
     or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
  end if;

  loop
    generated_code := upper(encode(extensions.gen_random_bytes(4), 'hex'));
    begin
      insert into public.rides (
        creator_id,
        name,
        description,
        code,
        start_date,
        end_date,
        notification_time,
        strict_schedule
      )
      values (
        current_user_id,
        btrim(p_name),
        nullif(btrim(p_description), ''),
        generated_code,
        p_start_date,
        p_end_date,
        p_notification_time,
        coalesce(p_strict_schedule, true)
      )
      returning * into new_ride;
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  insert into public.ride_members (ride_id, user_id, role)
  values (new_ride.id, current_user_id, 'creator');

  perform public.replace_ride_schedule(new_ride.id, p_weekdays);

  return new_ride;
end;
$$;

drop function if exists public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean
);

create function public.update_ride_with_schedule(
  p_ride_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null,
  p_strict_schedule boolean default true
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_ride public.rides;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may update this ride' using errcode = '42501';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date' using errcode = '22023';
  end if;

  if p_weekdays is null
     or cardinality(p_weekdays) not between 1 and 7
     or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and (
        scheduled_date < p_start_date
        or (p_end_date is not null and scheduled_date > p_end_date)
      )
  ) then
    raise exception 'New ride dates would exclude existing posts' using errcode = '22023';
  end if;

  update public.rides
  set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    start_date = p_start_date,
    end_date = p_end_date,
    notification_time = p_notification_time,
    strict_schedule = coalesce(p_strict_schedule, true)
  where id = p_ride_id
    and is_archived = false
  returning * into updated_ride;

  if not found then
    raise exception 'Active ride not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and not (
        extract(dow from scheduled_date)::smallint = any(p_weekdays)
      )
  ) then
    raise exception 'New weekdays would exclude existing posts' using errcode = '22023';
  end if;

  perform public.replace_ride_schedule(p_ride_id, p_weekdays);
  return updated_ride;
end;
$$;

create or replace function public.preview_ride_by_code(p_code text, p_local_date date)
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
      when target.end_date is not null and p_local_date > target.end_date then 'expired'
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

create or replace function public.join_ride_by_code(p_code text, p_local_date date)
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
  if target_ride.end_date is not null and p_local_date > target_ride.end_date then
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

-- Creator can bring an archived Ride back. If it had already ended, clear
-- end_date so it becomes an open-ended live Ride again.
create or replace function public.unarchive_ride(
  p_ride_id uuid,
  p_local_date date default current_date
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  restored_ride public.rides;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may restore this ride' using errcode = '42501';
  end if;

  update public.rides
  set
    is_archived = false,
    archived_at = null,
    end_date = case
      when end_date is not null and end_date < p_local_date then null
      else end_date
    end
  where id = p_ride_id
    and is_archived = true
  returning * into restored_ride;

  if not found then
    raise exception 'Archived ride not found' using errcode = 'P0002';
  end if;

  return restored_ride;
end;
$$;

revoke execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean
) from public, anon;
revoke execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean
) from public, anon;
revoke execute on function public.unarchive_ride(uuid, date) from public, anon;

grant execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean
) to authenticated;
grant execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean
) to authenticated;
grant execute on function public.unarchive_ride(uuid, date) to authenticated;
