-- 24h temporary posts: always-available camera outside scheduled days,
-- max 3 active temps per user per ride, auto-cleanup + distinct push copy.

alter table public.posts
  add column if not exists is_temporary boolean not null default false,
  add column if not exists expires_at timestamptz;

alter table public.posts
  drop constraint if exists posts_ride_user_date_key;

alter table public.posts
  drop constraint if exists posts_temporary_expires_consistency;

alter table public.posts
  add constraint posts_temporary_expires_consistency
  check (
    (is_temporary = false and expires_at is null)
    or (is_temporary = true and expires_at is not null)
  );

create unique index if not exists posts_ride_user_date_permanent_key
  on public.posts (ride_id, user_id, scheduled_date)
  where is_temporary = false;

create index if not exists posts_temporary_expires_at_idx
  on public.posts (expires_at)
  where is_temporary = true;

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

  if new.image_path <> new.ride_id::text || '/' || new.user_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Invalid post image path' using errcode = '22023';
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

create or replace function public.cleanup_expired_temporary_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_paths text[];
  deleted_count integer := 0;
begin
  select coalesce(array_agg(image_path), '{}'::text[])
    into expired_paths
  from public.posts
  where is_temporary = true
    and expires_at <= now();

  if cardinality(expired_paths) = 0 then
    return 0;
  end if;

  begin
    delete from storage.objects
    where bucket_id = 'ride-posts'
      and name = any (expired_paths);
  exception
    when others then
      null;
  end;

  delete from public.posts
  where is_temporary = true
    and expires_at <= now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_temporary_posts() from public, anon, authenticated;
grant execute on function public.cleanup_expired_temporary_posts() to service_role;

-- Best-effort schedule when pg_cron is available (hosted Supabase often enables it).
do $$
begin
  create extension if not exists pg_cron with schema extensions;
  perform cron.unschedule('cleanup-expired-temporary-posts');
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'cleanup-expired-temporary-posts',
    '*/15 * * * *',
    $cron$ select public.cleanup_expired_temporary_posts(); $cron$
  );
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

create or replace function public.notify_ride_members_of_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  author_username text;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
begin
  select p.username, r.name
  into author_username, ride_name
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  if coalesce(new.is_temporary, false) then
    push_title := '24h photo';
    push_body := format(
      '@%s shared a temporary photo in %s',
      coalesce(author_username, 'Someone'),
      coalesce(ride_name, 'your Ride')
    );
  else
    push_title := 'New photo';
    push_body := format(
      '@%s posted in %s',
      coalesce(author_username, 'Someone'),
      coalesce(ride_name, 'your Ride')
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
        'sound', 'default',
        'badge', 1,
        'data', jsonb_build_object(
          'kind', 'social_post',
          'rideId', new.ride_id,
          'postId', new.id,
          'isTemporary', coalesce(new.is_temporary, false)
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = new.ride_id
    and pt.user_id <> new.user_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

-- Column-level grants from the foundation migration omit the new fields.
grant insert (
  id,
  ride_id,
  user_id,
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at
)
  on table public.posts to authenticated;

grant update (
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at
)
  on table public.posts to authenticated;
