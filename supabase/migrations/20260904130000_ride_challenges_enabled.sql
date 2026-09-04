-- Per-ride challenges opt-in toggle (create / settings).

alter table public.rides
  add column if not exists challenges_enabled boolean not null default true;

comment on column public.rides.challenges_enabled is
  'When false, auto and manual challenges cannot be opened for this ride.';

-- Gate challenge opens on the toggle.
create or replace function public.insert_ride_challenge(
  p_ride_id uuid,
  p_challenge_id uuid,
  p_source text,
  p_opened_by_user_id uuid
)
returns public.ride_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_row public.rides%rowtype;
  created public.ride_challenges;
begin
  select * into ride_row from public.rides where id = p_ride_id for update;
  if ride_row.id is null then
    raise exception 'Ride not found' using errcode = '23503';
  end if;

  if ride_row.is_archived then
    raise exception 'Cannot open a challenge on an archived ride' using errcode = '22023';
  end if;

  if not ride_row.challenges_enabled then
    raise exception 'Challenges are turned off for this ride' using errcode = '22023';
  end if;

  if ride_row.start_date > (timezone('UTC', now()))::date then
    raise exception 'Ride has not started yet' using errcode = '22023';
  end if;

  if ride_row.end_date is not null
     and ride_row.end_date < (timezone('UTC', now()))::date then
    raise exception 'Ride has ended' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.ride_challenges rc
    where rc.ride_id = p_ride_id
      and rc.ends_at > now()
  ) then
    raise exception 'This ride already has an active challenge' using errcode = 'P0001';
  end if;

  insert into public.ride_challenges (
    ride_id,
    challenge_id,
    starts_at,
    ends_at,
    source,
    opened_by_user_id
  )
  values (
    p_ride_id,
    p_challenge_id,
    now(),
    now() + interval '24 hours',
    p_source,
    p_opened_by_user_id
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.insert_ride_challenge(uuid, uuid, text, uuid)
  from public, anon, authenticated;

-- Auto-open only rides with challenges enabled.
create or replace function public.open_due_auto_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_rec record;
  opened_count integer := 0;
  quota integer;
  opened_this_month integer;
  remaining_quota integer;
  remaining_days integer;
  should_open boolean;
  chosen uuid;
  month_start timestamptz;
  month_end timestamptz;
  today_utc date;
begin
  today_utc := (timezone('UTC', now()))::date;
  month_start := date_trunc('month', timezone('UTC', now()));
  month_end := month_start + interval '1 month';
  remaining_days := (
    (date_trunc('month', timezone('UTC', now())) + interval '1 month')::date
    - today_utc
  );

  for ride_rec in
    select r.id
    from public.rides r
    where r.is_archived = false
      and r.challenges_enabled = true
      and r.start_date <= today_utc
      and (r.end_date is null or r.end_date >= today_utc)
      and not exists (
        select 1
        from public.ride_challenges rc
        where rc.ride_id = r.id
          and rc.ends_at > now()
      )
  loop
    begin
      quota := public.ride_monthly_challenge_quota(ride_rec.id);

      select count(*)::integer into opened_this_month
      from public.ride_challenges rc
      where rc.ride_id = ride_rec.id
        and rc.starts_at >= month_start
        and rc.starts_at < month_end;

      remaining_quota := quota - opened_this_month;
      if remaining_quota <= 0 then
        continue;
      end if;

      if remaining_days <= remaining_quota then
        should_open := true;
      else
        should_open := random() < (remaining_quota::numeric / remaining_days::numeric);
      end if;

      if not should_open then
        continue;
      end if;

      chosen := public.pick_challenge_for_ride(ride_rec.id, null);
      perform public.insert_ride_challenge(ride_rec.id, chosen, 'auto', null);
      opened_count := opened_count + 1;
    exception
      when others then
        null;
    end;
  end loop;

  return opened_count;
end;
$$;

revoke all on function public.open_due_auto_challenges() from public, anon, authenticated;
grant execute on function public.open_due_auto_challenges() to service_role;

-- Recreate create / update with challenges_enabled.
drop function if exists public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date, text, smallint, smallint
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
  p_weekday_ordinal smallint default null,
  p_challenges_enabled boolean default true
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
        weekday_ordinal,
        challenges_enabled
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
        case when kind = 'monthly_weekday' then p_weekday_ordinal else null end,
        coalesce(p_challenges_enabled, true)
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
  uuid, text, date, date, time without time zone, smallint[], text, boolean, text, smallint, smallint
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
  p_weekday_ordinal smallint default null,
  p_challenges_enabled boolean default true
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
    weekday_ordinal = ordinal_value,
    challenges_enabled = coalesce(p_challenges_enabled, true)
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

revoke execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date, text, smallint, smallint, boolean
) from public, anon;
revoke execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean, text, smallint, smallint, boolean
) from public, anon;

grant execute on function public.create_ride(
  text, date, date, time without time zone, smallint[], text, boolean, date, text, smallint, smallint, boolean
) to authenticated;
grant execute on function public.update_ride_with_schedule(
  uuid, text, date, date, time without time zone, smallint[], text, boolean, text, smallint, smallint, boolean
) to authenticated;
