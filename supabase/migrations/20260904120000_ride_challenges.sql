-- Ride challenges: global catalog, per-ride 24h instances, post linking,
-- auto-scheduling from ride cadence, owner manual open, and push notify.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_title_length check (char_length(title) between 1 and 120),
  constraint challenges_description_length check (char_length(description) between 1 and 500)
);

create trigger challenges_set_updated_at
before update on public.challenges
for each row
execute function public.set_updated_at();

create index challenges_active_idx
  on public.challenges (is_active)
  where is_active = true;

insert into public.challenges (title, description) values
  ('Red car', 'Take a photo with a red car somewhere in the frame.'),
  ('Mirror selfie, not you', 'Capture a mirror selfie that somehow isn''t of yourself.'),
  ('Something yellow', 'Find and photograph something boldly yellow.'),
  ('Hands only', 'A photo that shows only hands — no faces.'),
  ('From the ground', 'Shoot a scene from ground level looking up.'),
  ('Neon at night', 'Catch neon lights after dark.'),
  ('Two of a kind', 'Two matching objects side by side.'),
  ('Window world', 'A photo taken through a window.'),
  ('Found note', 'Photograph a handwritten note or sign you didn''t write.'),
  ('Sky slice', 'Most of the frame should be sky.'),
  -- Gym / fitness
  ('Post-workout face', 'The sweaty, wrecked, triumphant face right after training.'),
  ('Leg day regret', 'Document the exact moment stairs became your enemy.'),
  ('Gym fit check', 'Show off today''s workout outfit — the more chaotic the better.'),
  ('Water bottle summit', 'Your hydration setup in its full glory.'),
  ('Pre-workout pump', 'The hype selfie before you touch a single weight.'),
  ('Home gym hack', 'Photograph your most questionable improvised piece of gym equipment.'),
  ('Snack after gains', 'The meal or snack that undoes the whole workout.'),
  ('Steps flex', 'Screenshot or photo proof of your step count today.'),
  -- Cooking / food
  ('Breakfast masterpiece', 'Plate up your breakfast like it costs 30 euros.'),
  ('Fridge chaos', 'Open your fridge and photograph exactly what''s inside — no cleanup.'),
  ('Burnt but proud', 'Something you cooked that didn''t fully survive.'),
  ('One-pot wonder', 'The whole meal that came out of a single pan or pot.'),
  ('Midnight snack', 'Catch your late-night kitchen crime in the act.'),
  ('Coffee art attempt', 'Your best (or worst) attempt at a fancy coffee.'),
  ('Spice rack reveal', 'Show the current state of your spices and condiments.'),
  ('Cooking mid-mess', 'A photo of the kitchen at peak cooking disaster.'),
  ('Plate it fancy', 'Take the most boring food you have and plate it like a restaurant.'),
  ('Fridge poetry meal', 'Build a meal using only what''s already in your kitchen right now.'),
  -- Funny / everyday
  ('Worst selfie', 'The most unflattering selfie you can produce on purpose.'),
  ('Socks of the day', 'Whatever is on your feet right now — show it.'),
  ('Desk disaster', 'Photograph your desk or workspace exactly as it is.'),
  ('Reflection in a spoon', 'A self-portrait using the back of a spoon.'),
  ('Shadow shot', 'A photo where the shadow is the main character.'),
  ('Tiny detail', 'Get as close as your camera allows to something small.'),
  ('View from your seat', 'Whatever you can see without getting up.'),
  ('Same color trio', 'Three objects of the exact same color in one frame.'),
  ('Upside down', 'A photo that only makes sense flipped upside down.'),
  ('Blurry on purpose', 'One intentionally, artistically terrible blurry shot.');

-- ---------------------------------------------------------------------------
-- Per-ride instances
-- ---------------------------------------------------------------------------

create table public.ride_challenges (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  source text not null check (source in ('auto', 'manual')),
  opened_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ride_challenges_window check (ends_at > starts_at)
);

create index ride_challenges_ride_starts_idx
  on public.ride_challenges (ride_id, starts_at desc);

create index ride_challenges_active_idx
  on public.ride_challenges (ride_id, ends_at);

create index ride_challenges_month_idx
  on public.ride_challenges (ride_id, starts_at);

-- ---------------------------------------------------------------------------
-- Posts link
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists ride_challenge_id uuid
    references public.ride_challenges(id) on delete set null;

create unique index posts_ride_challenge_user_key
  on public.posts (ride_challenge_id, user_id)
  where ride_challenge_id is not null;

create index posts_ride_challenge_id_idx
  on public.posts (ride_challenge_id)
  where ride_challenge_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.challenges enable row level security;
alter table public.ride_challenges enable row level security;

create policy challenges_select_authenticated
on public.challenges
for select
to authenticated
using (true);

create policy ride_challenges_select_members
on public.ride_challenges
for select
to authenticated
using (public.is_ride_member(ride_id));

revoke all on table public.challenges from anon, authenticated;
revoke all on table public.ride_challenges from anon, authenticated;
grant select on table public.challenges to authenticated;
grant select on table public.ride_challenges to authenticated;

-- Allow clients to write ride_challenge_id on insert (validated by trigger).
grant insert (
  id,
  ride_id,
  user_id,
  scheduled_date,
  image_path,
  audio_path,
  video_path,
  video_duration_ms,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at,
  ride_challenge_id
) on table public.posts to authenticated;

-- ---------------------------------------------------------------------------
-- Quota helpers
-- ---------------------------------------------------------------------------

create or replace function public.ride_estimated_monthly_posts(p_ride_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  kind text;
  weekday_count integer;
begin
  select schedule_kind into kind
  from public.rides
  where id = p_ride_id;

  if kind is null then
    raise exception 'Ride not found' using errcode = '23503';
  end if;

  if kind in ('monthly_date', 'monthly_weekday') then
    return 1;
  end if;

  select count(*)::integer into weekday_count
  from public.ride_schedule_days
  where ride_id = p_ride_id;

  if weekday_count < 1 then
    weekday_count := 1;
  end if;

  if kind = 'biweekly' then
    return weekday_count * (30.0 / 14.0);
  end if;

  -- weekly (default)
  return weekday_count * (30.0 / 7.0);
end;
$$;

create or replace function public.ride_monthly_challenge_quota(p_ride_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(1, floor(public.ride_estimated_monthly_posts(p_ride_id) * 0.15)::integer);
$$;

revoke all on function public.ride_estimated_monthly_posts(uuid) from public, anon, authenticated;
revoke all on function public.ride_monthly_challenge_quota(uuid) from public, anon, authenticated;
grant execute on function public.ride_monthly_challenge_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pick catalog challenge (prefer unused on ride, else least recent)
-- ---------------------------------------------------------------------------

create or replace function public.pick_challenge_for_ride(
  p_ride_id uuid,
  p_challenge_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  chosen uuid;
begin
  if p_challenge_id is not null then
    select c.id into chosen
    from public.challenges c
    where c.id = p_challenge_id
      and c.is_active = true;
    if chosen is null then
      raise exception 'Challenge not found or inactive' using errcode = '22023';
    end if;
    return chosen;
  end if;

  -- Prefer never used on this ride.
  select c.id into chosen
  from public.challenges c
  where c.is_active = true
    and not exists (
      select 1
      from public.ride_challenges rc
      where rc.ride_id = p_ride_id
        and rc.challenge_id = c.id
    )
  order by random()
  limit 1;

  if chosen is not null then
    return chosen;
  end if;

  -- Else least recently used (or never — all used).
  select c.id into chosen
  from public.challenges c
  left join lateral (
    select max(rc.starts_at) as last_used
    from public.ride_challenges rc
    where rc.ride_id = p_ride_id
      and rc.challenge_id = c.id
  ) usage on true
  where c.is_active = true
  order by usage.last_used asc nulls first, random()
  limit 1;

  if chosen is null then
    raise exception 'No active challenges in catalog' using errcode = 'P0001';
  end if;

  return chosen;
end;
$$;

revoke all on function public.pick_challenge_for_ride(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Core open helper (used by manual RPC + auto cron)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Manual open (ride creator)
-- ---------------------------------------------------------------------------

create or replace function public.open_ride_challenge(
  p_ride_id uuid,
  p_challenge_id uuid default null
)
returns public.ride_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen uuid;
  created public.ride_challenges;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_ride_creator(p_ride_id) then
    raise exception 'Only the ride creator can open a challenge' using errcode = '42501';
  end if;

  chosen := public.pick_challenge_for_ride(p_ride_id, p_challenge_id);
  created := public.insert_ride_challenge(p_ride_id, chosen, 'manual', auth.uid());
  return created;
end;
$$;

revoke all on function public.open_ride_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.open_ride_challenge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto open (pg_cron)
-- ---------------------------------------------------------------------------

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
        -- Skip rides that fail (e.g. empty catalog race); continue others.
        null;
    end;
  end loop;

  return opened_count;
end;
$$;

revoke all on function public.open_due_auto_challenges() from public, anon, authenticated;
grant execute on function public.open_due_auto_challenges() to service_role;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
  perform cron.unschedule('open-due-auto-challenges');
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'open-due-auto-challenges',
    '15 8 * * *',
    $cron$ select public.open_due_auto_challenges(); $cron$
  );
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- validate_post: challenge link rules
-- ---------------------------------------------------------------------------

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

  if new.ride_challenge_id is not null then
    if tg_op = 'UPDATE'
       and old.ride_challenge_id is not distinct from new.ride_challenge_id then
      -- unchanged challenge link
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

-- ---------------------------------------------------------------------------
-- Push: notify all ride members when a challenge opens
-- ---------------------------------------------------------------------------

create or replace function public.notify_ride_members_of_challenge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  challenge_title text;
  ride_name text;
  messages jsonb;
begin
  select c.title, r.name
  into challenge_title, ride_name
  from public.challenges c
  join public.rides r on r.id = new.ride_id
  where c.id = new.challenge_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'New challenge',
        'body', format(
          '%s · %s',
          coalesce(challenge_title, 'Challenge'),
          coalesce(ride_name, 'your Ride')
        ),
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'ride_challenge',
          'rideId', new.ride_id,
          'rideChallengeId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = new.ride_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

revoke all on function public.notify_ride_members_of_challenge()
  from public, anon, authenticated;

create trigger ride_challenges_notify_members
after insert on public.ride_challenges
for each row
execute function public.notify_ride_members_of_challenge();

comment on table public.challenges is 'Global catalog of ride challenge prompts.';
comment on table public.ride_challenges is '24-hour challenge instances opened for a ride.';
comment on column public.posts.ride_challenge_id is
  'When set, this post completes the linked ride challenge for the author.';
