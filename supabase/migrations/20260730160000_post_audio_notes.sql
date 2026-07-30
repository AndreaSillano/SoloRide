-- Optional voice notes attached to posts (m4a in ride-posts bucket).

alter table public.posts
  add column if not exists audio_path text;

alter table public.posts
  drop constraint if exists posts_audio_path_length;

alter table public.posts
  add constraint posts_audio_path_length
  check (audio_path is null or char_length(audio_path) between 1 and 512);

-- Allow m4a (audio/mp4) alongside JPEG in the private posts bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'audio/mp4']
where id = 'ride-posts';

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
  expected_image text;
  expected_audio text;
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

create or replace function public.can_access_ride_post_object(
  p_object_name text,
  p_operation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[];
  path_ride_id uuid;
  path_user_id uuid;
  path_post_id uuid;
  file_name text;
  matching_post_exists boolean;
begin
  path_parts := string_to_array(p_object_name, '/');
  if array_length(path_parts, 1) <> 3
     or path_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|m4a)$' then
    return false;
  end if;

  path_ride_id := path_parts[1]::uuid;
  path_user_id := path_parts[2]::uuid;
  file_name := path_parts[3];
  path_post_id := left(file_name, -4)::uuid;

  if p_operation = 'insert' then
    return path_user_id = auth.uid()
      and public.is_ride_member(path_ride_id, auth.uid());
  end if;

  select exists (
    select 1
    from public.posts
    where id = path_post_id
      and ride_id = path_ride_id
      and user_id = path_user_id
      and (image_path = p_object_name or audio_path = p_object_name)
  )
  into matching_post_exists;

  if p_operation = 'select' then
    return public.is_ride_member(path_ride_id, auth.uid())
      and (matching_post_exists or path_user_id = auth.uid());
  end if;

  if p_operation = 'delete' then
    return path_user_id = auth.uid()
      and public.is_ride_member(path_ride_id, auth.uid());
  end if;

  return false;
exception
  when invalid_text_representation then
    return false;
end;
$$;

create or replace function public.delete_own_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_image text;
  target_audio text;
  target_user uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select image_path, audio_path, user_id
    into target_image, target_audio, target_user
  from public.posts
  where id = p_post_id
  for update;

  if target_user is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if target_user is distinct from auth.uid() then
    raise exception 'Only the author may delete this post' using errcode = '42501';
  end if;

  begin
    perform set_config('row_security', 'off', true);
    delete from storage.objects
    where bucket_id = 'ride-posts'
      and name = target_image;
    if target_audio is not null then
      delete from storage.objects
      where bucket_id = 'ride-posts'
        and name = target_audio;
    end if;
  exception
    when others then
      begin
        delete from storage.objects
        where bucket_id = 'ride-posts'
          and name = target_image;
        if target_audio is not null then
          delete from storage.objects
          where bucket_id = 'ride-posts'
            and name = target_audio;
        end if;
      exception
        when others then
          null;
      end;
  end;

  delete from public.posts
  where id = p_post_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_own_post(uuid) from public, anon;
grant execute on function public.delete_own_post(uuid) to authenticated;

-- Column grants (foundation / temporary_posts used explicit insert lists).
grant insert (
  id,
  ride_id,
  user_id,
  scheduled_date,
  image_path,
  audio_path,
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
  audio_path,
  description,
  latitude,
  longitude,
  location_name,
  is_temporary,
  expires_at
)
  on table public.posts to authenticated;
