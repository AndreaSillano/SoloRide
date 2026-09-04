-- Challenge permanents must not block (or satisfy) the cadence permanent slot.
-- Unique index already excludes ride_challenge_id; validate_post still counted them.

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
  challenge_ride_id uuid;
  challenge_ends_at timestamptz;
  is_challenge boolean;
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

  -- Challenge completions are always permanent (never auto-delete).
  is_challenge := new.ride_challenge_id is not null;
  if is_challenge then
    new.is_temporary := false;
    new.expires_at := null;
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

    -- Challenge-only shares can land any day during the challenge window.
    -- Cadence permanents still must match the ride schedule.
    if not is_challenge then
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

      -- One cadence permanent per day (challenge rows are separate).
      if exists (
        select 1
        from public.posts
        where ride_id = new.ride_id
          and user_id = new.user_id
          and scheduled_date = new.scheduled_date
          and is_temporary = false
          and ride_challenge_id is null
          and id is distinct from new.id
      ) then
        raise exception 'Already posted for this date' using errcode = '23505';
      end if;
    end if;
  end if;

  if new.ride_challenge_id is not null then
    if tg_op = 'UPDATE'
       and old.ride_challenge_id is not distinct from new.ride_challenge_id then
      null;
    else
      select rc.ride_id, rc.ends_at
        into challenge_ride_id, challenge_ends_at
      from public.ride_challenges rc
      where rc.id = new.ride_challenge_id;

      if challenge_ride_id is null then
        raise exception 'Challenge not found' using errcode = '23503';
      end if;

      if challenge_ride_id <> new.ride_id then
        raise exception 'Challenge does not belong to this ride' using errcode = '22023';
      end if;

      if challenge_ends_at <= now() then
        raise exception 'This challenge has ended' using errcode = '22023';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_post() from public, anon, authenticated;
