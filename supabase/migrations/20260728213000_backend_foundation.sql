begin;

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text not null,
  display_name text not null,
  avatar_url text,
  recovery_email text,
  recovery_email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 24),
  constraint profiles_username_format check (
    username ~ '^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$'
  ),
  constraint profiles_username_normalized_format check (
    username_normalized = username
    and username_normalized ~ '^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$'
  ),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 80),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint profiles_recovery_email_format check (
    recovery_email is null
    or (
      char_length(recovery_email) <= 320
      and recovery_email = lower(btrim(recovery_email))
      and recovery_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  )
);

create unique index profiles_username_normalized_key
  on public.profiles (username_normalized);

create table public.rides (
  id uuid primary key default extensions.gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  code text not null,
  start_date date not null,
  end_date date not null,
  notification_time time without time zone not null,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rides_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint rides_description_length check (description is null or char_length(description) <= 2000),
  constraint rides_code_format check (code ~ '^[A-Z0-9]{8}$'),
  constraint rides_date_order check (end_date >= start_date),
  constraint rides_archive_state_consistent check (
    is_archived = (archived_at is not null)
  )
);

create unique index rides_code_key on public.rides (code);
create index rides_creator_id_idx on public.rides (creator_id);
create index rides_active_dates_idx on public.rides (start_date, end_date)
  where is_archived = false;

create table public.ride_schedule_days (
  id uuid primary key default extensions.gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  weekday smallint not null,
  created_at timestamptz not null default now(),
  constraint ride_schedule_days_ride_weekday_key unique (ride_id, weekday),
  constraint ride_schedule_days_weekday_range check (weekday between 0 and 6)
);

create table public.ride_members (
  id uuid primary key default extensions.gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  constraint ride_members_role_check check (role in ('creator', 'member')),
  constraint ride_members_ride_user_key unique (ride_id, user_id)
);

create unique index ride_members_one_creator_idx
  on public.ride_members (ride_id)
  where role = 'creator';
create index ride_members_user_id_idx on public.ride_members (user_id, ride_id);

create table public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  image_path text not null,
  description text,
  latitude double precision,
  longitude double precision,
  location_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_image_path_length check (char_length(image_path) between 1 and 512),
  constraint posts_description_length check (
    description is null or char_length(description) <= 2000
  ),
  constraint posts_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint posts_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint posts_coordinates_together check (
    (latitude is null) = (longitude is null)
  ),
  constraint posts_location_name_length check (
    location_name is null or char_length(btrim(location_name)) between 1 and 200
  ),
  constraint posts_ride_user_date_key unique (ride_id, user_id, scheduled_date)
);

create index posts_ride_scheduled_date_idx
  on public.posts (ride_id, scheduled_date desc, created_at desc);
create index posts_user_id_idx on public.posts (user_id);

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_content_length check (char_length(btrim(content)) between 1 and 2000)
);

create index comments_post_created_at_idx on public.comments (post_id, created_at);
create index comments_user_id_idx on public.comments (user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger rides_set_updated_at
before update on public.rides
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create function public.prepare_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile id cannot be changed' using errcode = '22023';
  end if;

  if new.username is distinct from old.username
     or new.username_normalized is distinct from old.username_normalized then
    raise exception 'Username cannot be changed' using errcode = '22023';
  end if;

  new.display_name := btrim(new.display_name);

  if new.recovery_email is distinct from old.recovery_email then
    new.recovery_email := nullif(lower(btrim(new.recovery_email)), '');
    new.recovery_email_verified := false;
  elsif new.recovery_email_verified is distinct from old.recovery_email_verified
        and coalesce(auth.role(), '') = 'authenticated' then
    new.recovery_email_verified := old.recovery_email_verified;
  end if;

  return new;
end;
$$;

create trigger profiles_prepare_update
before update on public.profiles
for each row execute function public.prepare_profile_update();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  candidate_display_name text;
begin
  requested_username := lower(regexp_replace(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  ), '[[:space:]]+', '', 'g'));

  candidate_display_name := left(btrim(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    requested_username
  )), 80);
  if candidate_display_name = '' then
    candidate_display_name := requested_username;
  end if;

  insert into public.profiles (
    id,
    username,
    username_normalized,
    display_name,
    avatar_url
  )
  values (
    new.id,
    requested_username,
    requested_username,
    candidate_display_name,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (
  id,
  username,
  username_normalized,
  display_name,
  avatar_url
)
select
  users.id,
  case
    when lower(split_part(coalesce(users.email, ''), '@', 1))
      ~ '^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$'
      and char_length(split_part(coalesce(users.email, ''), '@', 1)) between 3 and 24
    then lower(split_part(users.email, '@', 1))
    else 'rider_' || left(replace(users.id::text, '-', ''), 8)
  end,
  case
    when lower(split_part(coalesce(users.email, ''), '@', 1))
      ~ '^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$'
      and char_length(split_part(coalesce(users.email, ''), '@', 1)) between 3 and 24
    then lower(split_part(users.email, '@', 1))
    else 'rider_' || left(replace(users.id::text, '-', ''), 8)
  end,
  left(coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    'Rider'
  ), 80),
  nullif(users.raw_user_meta_data ->> 'avatar_url', '')
from auth.users as users
on conflict (id) do nothing;

create function public.is_ride_member(p_ride_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.ride_members
    where ride_id = p_ride_id
      and user_id = p_user_id
  );
$$;

create function public.is_ride_creator(p_ride_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.ride_members
    where ride_id = p_ride_id
      and user_id = p_user_id
      and role = 'creator'
  );
$$;

create function public.is_post_ride_member(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.posts
    join public.ride_members
      on ride_members.ride_id = posts.ride_id
    where posts.id = p_post_id
      and ride_members.user_id = p_user_id
  );
$$;

create function public.shares_ride_with(p_other_user_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.ride_members as mine
    join public.ride_members as theirs
      on theirs.ride_id = mine.ride_id
    where mine.user_id = p_user_id
      and theirs.user_id = p_other_user_id
  );
$$;

create function public.validate_post()
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

  if new.scheduled_date < ride_start or new.scheduled_date > ride_end then
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

  if new.image_path <> new.ride_id::text || '/' || new.user_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Invalid post image path' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger posts_validate
before insert or update on public.posts
for each row execute function public.validate_post();

alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.ride_schedule_days enable row level security;
alter table public.ride_members enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;

create policy profiles_select_shared
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.shares_ride_with(id)
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy rides_select_members
on public.rides
for select
to authenticated
using (public.is_ride_member(id));

create policy rides_update_creator
on public.rides
for update
to authenticated
using (public.is_ride_creator(id))
with check (
  public.is_ride_creator(id)
  and creator_id = (select auth.uid())
);

create policy schedule_select_members
on public.ride_schedule_days
for select
to authenticated
using (public.is_ride_member(ride_id));

create policy schedule_insert_creator
on public.ride_schedule_days
for insert
to authenticated
with check (public.is_ride_creator(ride_id));

create policy schedule_update_creator
on public.ride_schedule_days
for update
to authenticated
using (public.is_ride_creator(ride_id))
with check (public.is_ride_creator(ride_id));

create policy schedule_delete_creator
on public.ride_schedule_days
for delete
to authenticated
using (public.is_ride_creator(ride_id));

create policy ride_members_select_members
on public.ride_members
for select
to authenticated
using (public.is_ride_member(ride_id));

create policy posts_select_members
on public.posts
for select
to authenticated
using (public.is_ride_member(ride_id));

create policy posts_insert_own
on public.posts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_ride_member(ride_id)
);

create policy posts_update_own
on public.posts
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_ride_member(ride_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_ride_member(ride_id)
);

create policy posts_delete_own
on public.posts
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_ride_member(ride_id)
);

create policy comments_select_members
on public.comments
for select
to authenticated
using (public.is_post_ride_member(post_id));

create policy comments_insert_own
on public.comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

create policy comments_update_own
on public.comments
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

create policy comments_delete_own
on public.comments
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
);

create function public.replace_ride_schedule(p_ride_id uuid, p_weekdays smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_weekday smallint;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may replace the schedule' using errcode = '42501';
  end if;

  if p_weekdays is null
     or cardinality(p_weekdays) not between 1 and 7
     or array_position(p_weekdays, null) is not null then
    raise exception 'Weekdays must contain between 1 and 7 values' using errcode = '22023';
  end if;

  delete from public.ride_schedule_days where ride_id = p_ride_id;

  foreach schedule_weekday in array p_weekdays
  loop
    insert into public.ride_schedule_days (ride_id, weekday)
    values (p_ride_id, schedule_weekday);
  end loop;
end;
$$;

create function public.create_ride(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null
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
        notification_time
      )
      values (
        current_user_id,
        btrim(p_name),
        nullif(btrim(p_description), ''),
        generated_code,
        p_start_date,
        p_end_date,
        p_notification_time
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

create function public.update_ride_with_schedule(
  p_ride_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_notification_time time without time zone,
  p_weekdays smallint[],
  p_description text default null
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
    notification_time = p_notification_time
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

create function public.leave_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  select role
    into current_role
  from public.ride_members
  where ride_id = p_ride_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Ride membership not found' using errcode = 'P0002';
  end if;
  if current_role = 'creator' then
    raise exception 'The creator cannot leave their ride' using errcode = '42501';
  end if;

  delete from public.ride_members
  where ride_id = p_ride_id
    and user_id = auth.uid();
end;
$$;

create function public.archive_ride(p_ride_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_ride public.rides;
begin
  if not public.is_ride_creator(p_ride_id, auth.uid()) then
    raise exception 'Only the ride creator may archive this ride' using errcode = '42501';
  end if;

  update public.rides
  set
    is_archived = true,
    archived_at = coalesce(archived_at, now())
  where id = p_ride_id
  returning * into archived_ride;

  return archived_ride;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ride-posts', 'ride-posts', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create function public.can_access_ride_post_object(
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
  matching_post_exists boolean;
begin
  path_parts := string_to_array(p_object_name, '/');
  if array_length(path_parts, 1) <> 3
     or path_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or path_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$' then
    return false;
  end if;

  path_ride_id := path_parts[1]::uuid;
  path_user_id := path_parts[2]::uuid;
  path_post_id := left(path_parts[3], -4)::uuid;

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
      and image_path = p_object_name
  )
  into matching_post_exists;

  if p_operation = 'select' then
    return matching_post_exists
      and public.is_ride_member(path_ride_id, auth.uid());
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

create policy ride_posts_select_member_object
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.can_access_ride_post_object(name, 'select')
);

create policy ride_posts_insert_own_member_object
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ride-posts'
  and public.can_access_ride_post_object(name, 'insert')
);

create policy ride_posts_delete_own_member_object
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ride-posts'
  and public.can_access_ride_post_object(name, 'delete')
);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.rides from anon, authenticated;
revoke all on table public.ride_schedule_days from anon, authenticated;
revoke all on table public.ride_members from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.comments from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, recovery_email)
  on table public.profiles to authenticated;
grant select on table public.rides to authenticated;
grant select on table public.ride_schedule_days to authenticated;
grant select on table public.ride_members to authenticated;
grant select, delete on table public.posts to authenticated;
grant insert (
  id,
  ride_id,
  user_id,
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name
)
  on table public.posts to authenticated;
grant update (
  scheduled_date,
  image_path,
  description,
  latitude,
  longitude,
  location_name
)
  on table public.posts to authenticated;
grant select, delete on table public.comments to authenticated;
grant insert (id, post_id, user_id, content)
  on table public.comments to authenticated;
grant update (content) on table public.comments to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prepare_profile_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_post() from public, anon, authenticated;
revoke execute on function public.is_ride_member(uuid, uuid) from public, anon;
revoke execute on function public.is_ride_creator(uuid, uuid) from public, anon;
revoke execute on function public.is_post_ride_member(uuid, uuid) from public, anon;
revoke execute on function public.shares_ride_with(uuid, uuid) from public, anon;
revoke execute on function public.replace_ride_schedule(uuid, smallint[]) from public, anon, authenticated;
revoke execute on function public.create_ride(text, date, date, time without time zone, smallint[], text) from public, anon;
revoke execute on function public.preview_ride_by_code(text, date) from public, anon;
revoke execute on function public.join_ride_by_code(text, date) from public, anon;
revoke execute on function public.update_ride_with_schedule(uuid, text, date, date, time without time zone, smallint[], text) from public, anon;
revoke execute on function public.leave_ride(uuid) from public, anon;
revoke execute on function public.archive_ride(uuid) from public, anon;
revoke execute on function public.can_access_ride_post_object(text, text) from public, anon;

grant execute on function public.is_ride_member(uuid, uuid) to authenticated;
grant execute on function public.is_ride_creator(uuid, uuid) to authenticated;
grant execute on function public.is_post_ride_member(uuid, uuid) to authenticated;
grant execute on function public.shares_ride_with(uuid, uuid) to authenticated;
grant execute on function public.create_ride(text, date, date, time without time zone, smallint[], text) to authenticated;
grant execute on function public.preview_ride_by_code(text, date) to authenticated;
grant execute on function public.join_ride_by_code(text, date) to authenticated;
grant execute on function public.update_ride_with_schedule(uuid, text, date, date, time without time zone, smallint[], text) to authenticated;
grant execute on function public.leave_ride(uuid) to authenticated;
grant execute on function public.archive_ride(uuid) to authenticated;
grant execute on function public.can_access_ride_post_object(text, text) to authenticated;

comment on column public.ride_schedule_days.weekday is '0=Sunday through 6=Saturday';
comment on column public.rides.notification_time is 'Local wall-clock notification time; timezone is chosen by the client';

commit;
