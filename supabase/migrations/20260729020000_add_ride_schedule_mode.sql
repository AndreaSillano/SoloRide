begin;

-- Strict rides require a photo on every selected day. Flexible rides retain
-- the same selected-day posting window but only require one post per Sun-Sat
-- week. Existing Rides remain strict by default.
alter table public.rides
  add column strict_schedule boolean not null default true;

drop function if exists public.create_ride(
  text, date, date, time without time zone, smallint[], text
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
  uuid, text, date, date, time without time zone, smallint[], text
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

  if p_weekdays is null
     or cardinality(p_weekdays) not between 1 and 7
     or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and scheduled_date not between p_start_date and p_end_date
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

revoke execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean
) from public, anon;
revoke execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean
) from public, anon;

grant execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean
) to authenticated;
grant execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean
) to authenticated;

commit;
