-- Granular posting rhythms: weekly (default), biweekly, monthly day-of-month,
-- and monthly nth/last weekday. Existing rides stay weekly.

alter table public.rides
  add column if not exists schedule_kind text not null default 'weekly',
  add column if not exists month_day smallint,
  add column if not exists weekday_ordinal smallint;

alter table public.rides
  drop constraint if exists rides_schedule_kind_check;

alter table public.rides
  add constraint rides_schedule_kind_check
  check (schedule_kind in ('weekly', 'biweekly', 'monthly_date', 'monthly_weekday'));

alter table public.rides
  drop constraint if exists rides_month_day_check;

alter table public.rides
  add constraint rides_month_day_check
  check (month_day is null or month_day between 1 and 31);

alter table public.rides
  drop constraint if exists rides_weekday_ordinal_check;

alter table public.rides
  add constraint rides_weekday_ordinal_check
  check (weekday_ordinal is null or weekday_ordinal in (-1, 1, 2, 3, 4));

comment on column public.rides.schedule_kind is
  'weekly | biweekly | monthly_date | monthly_weekday';
comment on column public.rides.month_day is
  'Day of month (1-31) when schedule_kind = monthly_date; short months clamp to last day.';
comment on column public.rides.weekday_ordinal is
  '1-4 = nth weekday, -1 = last, when schedule_kind = monthly_weekday.';

-- Sunday-based week start (matches client getWeekRange).
create or replace function public.sunday_of_week(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - extract(dow from p_date)::integer;
$$;

create or replace function public.matches_ride_schedule(
  p_schedule_kind text,
  p_start_date date,
  p_weekdays smallint[],
  p_month_day smallint,
  p_weekday_ordinal smallint,
  p_date date
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text := coalesce(nullif(p_schedule_kind, ''), 'weekly');
  dow smallint := extract(dow from p_date)::smallint;
  weeks integer;
  days_in_month integer;
  target_day integer;
  occurrence integer;
begin
  if kind = 'weekly' then
    return p_weekdays is not null and dow = any (p_weekdays);
  end if;

  if kind = 'biweekly' then
    if p_weekdays is null or not (dow = any (p_weekdays)) then
      return false;
    end if;
    weeks := (
      public.sunday_of_week(p_date) - public.sunday_of_week(p_start_date)
    ) / 7;
    return weeks >= 0 and weeks % 2 = 0;
  end if;

  if kind = 'monthly_date' then
    if p_month_day is null or p_month_day < 1 then
      return false;
    end if;
    days_in_month := extract(
      day from (date_trunc('month', p_date) + interval '1 month - 1 day')
    )::integer;
    target_day := least(p_month_day, days_in_month);
    return extract(day from p_date)::integer = target_day;
  end if;

  if kind = 'monthly_weekday' then
    if p_weekdays is null
       or cardinality(p_weekdays) < 1
       or dow <> p_weekdays[1]
       or p_weekday_ordinal is null then
      return false;
    end if;
    occurrence := ((extract(day from p_date)::integer - 1) / 7) + 1;
    if p_weekday_ordinal = -1 then
      return (p_date + 7) > (
        date_trunc('month', p_date) + interval '1 month - 1 day'
      )::date;
    end if;
    return occurrence = p_weekday_ordinal;
  end if;

  return false;
end;
$$;

create or replace function public.validate_ride_schedule_params(
  p_schedule_kind text,
  p_weekdays smallint[],
  p_month_day smallint,
  p_weekday_ordinal smallint
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text := coalesce(nullif(p_schedule_kind, ''), 'weekly');
begin
  if kind not in ('weekly', 'biweekly', 'monthly_date', 'monthly_weekday') then
    raise exception 'Invalid schedule kind' using errcode = '22023';
  end if;

  if kind in ('weekly', 'biweekly') then
    if p_weekdays is null
       or cardinality(p_weekdays) not between 1 and 7
       or array_position(p_weekdays, null) is not null then
      raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
    end if;
    return;
  end if;

  if kind = 'monthly_date' then
    if p_month_day is null or p_month_day not between 1 and 31 then
      raise exception 'Month day must be between 1 and 31' using errcode = '22023';
    end if;
    return;
  end if;

  -- monthly_weekday
  if p_weekdays is null
     or cardinality(p_weekdays) <> 1
     or p_weekdays[1] is null
     or p_weekdays[1] not between 0 and 6 then
    raise exception 'Choose exactly one weekday for monthly weekday schedules'
      using errcode = '22023';
  end if;
  if p_weekday_ordinal is null or p_weekday_ordinal not in (-1, 1, 2, 3, 4) then
    raise exception 'Weekday ordinal must be 1-4 or -1 (last)' using errcode = '22023';
  end if;
end;
$$;

-- Allow empty weekday arrays for monthly_date (clears ride_schedule_days).
create or replace function public.replace_ride_schedule(p_ride_id uuid, p_weekdays smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_weekday smallint;
begin
  if p_weekdays is null then
    raise exception 'Weekdays cannot be null' using errcode = '22023';
  end if;

  if cardinality(p_weekdays) > 7 or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 0 and 7 values' using errcode = '22023';
  end if;

  delete from public.ride_schedule_days where ride_id = p_ride_id;

  if cardinality(p_weekdays) = 0 then
    return;
  end if;

  foreach schedule_weekday in array p_weekdays
  loop
    if schedule_weekday < 0 or schedule_weekday > 6 then
      raise exception 'Weekday must be between 0 and 6' using errcode = '22023';
    end if;
    insert into public.ride_schedule_days (ride_id, weekday)
    values (p_ride_id, schedule_weekday);
  end loop;
end;
$$;

create or replace function public.validate_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride_start date;
  ride_end date;
  ride_archived boolean;
  ride_kind text;
  ride_month_day smallint;
  ride_weekday_ordinal smallint;
  ride_weekdays smallint[];
  active_temp_count integer;
  today_video_count integer;
  expected_image text;
  expected_audio text;
  expected_video text;
begin
  select
    start_date,
    end_date,
    is_archived,
    schedule_kind,
    month_day,
    weekday_ordinal
    into
      ride_start,
      ride_end,
      ride_archived,
      ride_kind,
      ride_month_day,
      ride_weekday_ordinal
  from public.rides
  where id = new.ride_id;

  if ride_start is null then
    raise exception 'Ride not found' using errcode = '23503';
  end if;

  if ride_archived then
    raise exception 'Cannot post to an archived ride' using errcode = '22023';
  end if;

  if new.scheduled_date < ride_start
     or (ride_end is not null and new.scheduled_date > ride_end) then
    raise exception 'Post date must be within ride dates' using errcode = '22023';
  end if;

  expected_image := new.ride_id::text || '/' || new.user_id::text || '/' || new.id::text || '.jpg';
  if new.image_path <> expected_image then
    raise exception 'Invalid post image path' using errcode = '22023';
  end if;

  expected_audio := new.ride_id::text || '/' || new.user_id::text || '/' || new.id::text || '.m4a';
  if new.audio_path is not null and new.audio_path <> expected_audio then
    raise exception 'Invalid post audio path' using errcode = '22023';
  end if;

  expected_video := new.ride_id::text || '/' || new.user_id::text || '/' || new.id::text || '.mp4';
  if new.video_path is not null and new.video_path <> expected_video then
    raise exception 'Invalid post video path' using errcode = '22023';
  end if;

  if new.video_path is not null then
    select count(*)::integer
      into today_video_count
    from public.posts
    where user_id = new.user_id
      and video_path is not null
      and (timezone('UTC', created_at))::date = (timezone('UTC', coalesce(new.created_at, now())))::date
      and id is distinct from new.id;

    if today_video_count >= 2 then
      raise exception 'Daily video limit reached (max 2 per day)'
        using errcode = 'P0001';
    end if;
  end if;

  if coalesce(new.is_temporary, false) then
    new.is_temporary := true;
    new.expires_at := coalesce(new.created_at, now()) + interval '24 hours';

    select count(*)::integer
      into active_temp_count
    from public.posts
    where ride_id = new.ride_id
      and user_id = new.user_id
      and is_temporary = true
      and expires_at > now()
      and id is distinct from new.id;

    if active_temp_count >= 3 then
      raise exception 'Temporary photo limit reached (max 3 active per ride)'
        using errcode = 'P0001';
    end if;
  else
    new.is_temporary := false;
    new.expires_at := null;

    select coalesce(array_agg(weekday order by weekday), '{}'::smallint[])
      into ride_weekdays
    from public.ride_schedule_days
    where ride_id = new.ride_id;

    if not public.matches_ride_schedule(
      ride_kind,
      ride_start,
      ride_weekdays,
      ride_month_day,
      ride_weekday_ordinal,
      new.scheduled_date
    ) then
      raise exception 'Post date is not a scheduled ride day' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date
);

create function public.create_ride(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null,
  p_strict_schedule boolean default true,
  p_local_date date default current_date,
  p_schedule_kind text default 'weekly',
  p_month_day smallint default null,
  p_weekday_ordinal smallint default null
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
  kind text := coalesce(nullif(p_schedule_kind, ''), 'weekly');
  is_strict boolean := case
    when kind = 'weekly' then coalesce(p_strict_schedule, true)
    else true
  end;
  weekdays smallint[] := coalesce(p_weekdays, '{}'::smallint[]);
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.count_user_live_rides(current_user_id, p_local_date) >= 4 then
    raise exception 'You can only be in 4 active Rides at a time' using errcode = '22023';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date' using errcode = '22023';
  end if;

  perform public.validate_ride_schedule_params(
    kind,
    weekdays,
    p_month_day,
    p_weekday_ordinal
  );

  if kind = 'monthly_date' then
    weekdays := '{}'::smallint[];
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
        strict_schedule,
        schedule_kind,
        month_day,
        weekday_ordinal
      )
      values (
        current_user_id,
        btrim(p_name),
        nullif(btrim(p_description), ''),
        generated_code,
        p_start_date,
        p_end_date,
        p_notification_time,
        is_strict,
        kind,
        case when kind = 'monthly_date' then p_month_day else null end,
        case when kind = 'monthly_weekday' then p_weekday_ordinal else null end
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

  perform public.replace_ride_schedule(new_ride.id, weekdays);

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
  p_strict_schedule boolean default true,
  p_schedule_kind text default 'weekly',
  p_month_day smallint default null,
  p_weekday_ordinal smallint default null
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_ride public.rides;
  kind text := coalesce(nullif(p_schedule_kind, ''), 'weekly');
  is_strict boolean := case
    when kind = 'weekly' then coalesce(p_strict_schedule, true)
    else true
  end;
  weekdays smallint[] := coalesce(p_weekdays, '{}'::smallint[]);
  month_day_value smallint := case
    when kind = 'monthly_date' then p_month_day
    else null
  end;
  ordinal_value smallint := case
    when kind = 'monthly_weekday' then p_weekday_ordinal
    else null
  end;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may update this ride' using errcode = '42501';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date' using errcode = '22023';
  end if;

  perform public.validate_ride_schedule_params(
    kind,
    weekdays,
    p_month_day,
    p_weekday_ordinal
  );

  if kind = 'monthly_date' then
    weekdays := '{}'::smallint[];
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and is_temporary = false
      and (
        scheduled_date < p_start_date
        or (p_end_date is not null and scheduled_date > p_end_date)
      )
  ) then
    raise exception 'New ride dates would exclude existing posts' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.posts
    where ride_id = p_ride_id
      and is_temporary = false
      and not public.matches_ride_schedule(
        kind,
        p_start_date,
        weekdays,
        month_day_value,
        ordinal_value,
        scheduled_date
      )
  ) then
    raise exception 'New schedule would exclude existing posts' using errcode = '22023';
  end if;

  update public.rides
  set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    start_date = p_start_date,
    end_date = p_end_date,
    notification_time = p_notification_time,
    strict_schedule = is_strict,
    schedule_kind = kind,
    month_day = month_day_value,
    weekday_ordinal = ordinal_value
  where id = p_ride_id
    and is_archived = false
  returning * into updated_ride;

  if not found then
    raise exception 'Active ride not found' using errcode = 'P0002';
  end if;

  perform public.replace_ride_schedule(p_ride_id, weekdays);
  return updated_ride;
end;
$$;

revoke execute on function public.sunday_of_week(date) from public, anon, authenticated;
revoke execute on function public.matches_ride_schedule(
  text, date, smallint[], smallint, smallint, date
) from public, anon, authenticated;
revoke execute on function public.validate_ride_schedule_params(
  text, smallint[], smallint, smallint
) from public, anon, authenticated;
revoke execute on function public.validate_post() from public, anon, authenticated;
revoke execute on function public.replace_ride_schedule(uuid, smallint[]) from public, anon, authenticated;
revoke execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date, text, smallint, smallint
) from public, anon;
revoke execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean, text, smallint, smallint
) from public, anon;

grant execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date, text, smallint, smallint
) to authenticated;
grant execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean, text, smallint, smallint
) to authenticated;
