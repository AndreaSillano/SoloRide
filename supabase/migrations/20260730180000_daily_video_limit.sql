-- Daily video cap: each user may publish at most 2 video posts per UTC day.

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
  active_temp_count integer;
  today_video_count integer;
  expected_image text;
  expected_audio text;
  expected_video text;
begin
  select start_date, end_date, is_archived
    into ride_start, ride_end, ride_archived
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

    if not exists (
      select 1
      from public.ride_schedule_days
      where ride_id = new.ride_id
        and weekday = extract(dow from new.scheduled_date)::smallint
    ) then
      raise exception 'Post date is not a scheduled ride weekday' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;
