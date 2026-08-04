-- Join requests (owner accept/reject) + owner kick member.

create table public.ride_join_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  constraint ride_join_requests_status_check
    check (status in ('pending', 'accepted', 'rejected')),
  constraint ride_join_requests_resolved_check
    check (
      (status = 'pending' and resolved_at is null and resolved_by is null)
      or (status <> 'pending' and resolved_at is not null)
    )
);

create unique index ride_join_requests_pending_ride_user_key
  on public.ride_join_requests (ride_id, user_id)
  where status = 'pending';

create index ride_join_requests_ride_status_idx
  on public.ride_join_requests (ride_id, status, created_at);

create index ride_join_requests_user_idx
  on public.ride_join_requests (user_id, status);

alter table public.ride_join_requests enable row level security;

create policy ride_join_requests_select_own_or_creator
on public.ride_join_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_ride_creator(ride_id)
);

revoke all on table public.ride_join_requests from anon, authenticated;
grant select on table public.ride_join_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Push helpers
-- ---------------------------------------------------------------------------

create or replace function public.notify_ride_creator_of_join_request()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requester_name text;
  ride_name text;
  creator_id uuid;
  messages jsonb;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.display_name), ''), p.username),
    r.name,
    r.creator_id
  into requester_name, ride_name, creator_id
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  if creator_id is null or creator_id = new.user_id then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Join request',
        'body', format(
          '%s wants to join %s',
          coalesce(requester_name, 'Someone'),
          coalesce(ride_name, 'your Ride')
        ),
        'sound', 'default',
        'badge', 1,
        'data', jsonb_build_object(
          'kind', 'join_request',
          'rideId', new.ride_id,
          'requestId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  where pt.user_id = creator_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_requester_of_join_decision()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
begin
  if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select r.name into ride_name
  from public.rides r
  where r.id = new.ride_id;

  if new.status = 'accepted' then
    push_title := 'Request accepted';
    push_body := format('You are in %s', coalesce(ride_name, 'the Ride'));
  else
    push_title := 'Request declined';
    push_body := format('Your request to join %s was declined', coalesce(ride_name, 'the Ride'));
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
          'kind', 'join_request_decision',
          'rideId', new.ride_id,
          'requestId', new.id,
          'status', new.status
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  where pt.user_id = new.user_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

drop trigger if exists ride_join_requests_notify_creator on public.ride_join_requests;
create trigger ride_join_requests_notify_creator
after insert on public.ride_join_requests
for each row
execute function public.notify_ride_creator_of_join_request();

-- Also notify when a rejected request is reopened to pending.
drop trigger if exists ride_join_requests_notify_creator_reopen on public.ride_join_requests;
create trigger ride_join_requests_notify_creator_reopen
after update of status on public.ride_join_requests
for each row
when (old.status is distinct from 'pending' and new.status = 'pending')
execute function public.notify_ride_creator_of_join_request();

drop trigger if exists ride_join_requests_notify_decision on public.ride_join_requests;
create trigger ride_join_requests_notify_decision
after update of status on public.ride_join_requests
for each row
execute function public.notify_requester_of_join_decision();

-- ---------------------------------------------------------------------------
-- Preview: surface pending + duplicate membership
-- ---------------------------------------------------------------------------

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
      count(members.id) as member_count,
      exists (
        select 1
        from public.ride_members as self_member
        where self_member.ride_id = rides.id
          and self_member.user_id = auth.uid()
      ) as is_member,
      exists (
        select 1
        from public.ride_join_requests as req
        where req.ride_id = rides.id
          and req.user_id = auth.uid()
          and req.status = 'pending'
      ) as has_pending
    from public.rides as rides
    left join public.ride_members as members on members.ride_id = rides.id
    where rides.code = upper(btrim(p_code))
      and auth.uid() is not null
    group by rides.id
  )
  select
    case
      when target.is_member then 'duplicate'
      when target.has_pending then 'pending'
      when target.is_archived then 'archived'
      when p_local_date < target.start_date then 'upcoming'
      when target.end_date is not null and p_local_date > target.end_date then 'expired'
      when target.member_count >= 16 then 'full'
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

-- ---------------------------------------------------------------------------
-- Request to join (replaces instant membership insert)
-- ---------------------------------------------------------------------------

create or replace function public.join_ride_by_code(p_code text, p_local_date date)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_ride public.rides;
  current_user_id uuid := auth.uid();
  current_members integer;
  existing_request public.ride_join_requests;
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

  select count(*)::integer
    into current_members
  from public.ride_members
  where ride_id = target_ride.id;

  if current_members >= 16 then
    raise exception 'Ride is full' using errcode = '22023';
  end if;

  if public.count_user_live_rides(current_user_id, p_local_date) >= 4 then
    raise exception 'You can only be in 4 active Rides at a time' using errcode = '22023';
  end if;

  select *
    into existing_request
  from public.ride_join_requests
  where ride_id = target_ride.id
    and user_id = current_user_id
    and status = 'pending'
  for update;

  if found then
    raise exception 'Join request already pending' using errcode = '22023';
  end if;

  -- Reopen the most recent rejected request, otherwise insert a new pending row.
  select *
    into existing_request
  from public.ride_join_requests
  where ride_id = target_ride.id
    and user_id = current_user_id
    and status = 'rejected'
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.ride_join_requests
    set
      status = 'pending',
      created_at = now(),
      resolved_at = null,
      resolved_by = null
    where id = existing_request.id;
  else
    insert into public.ride_join_requests (ride_id, user_id, status)
    values (target_ride.id, current_user_id, 'pending');
  end if;

  return target_ride;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept / reject
-- ---------------------------------------------------------------------------

create or replace function public.accept_ride_join_request(
  p_request_id uuid,
  p_local_date date default current_date
)
returns public.ride_join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.ride_join_requests;
  target_ride public.rides;
  current_user_id uuid := auth.uid();
  current_members integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into target_request
  from public.ride_join_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  if not public.is_ride_creator(target_request.ride_id, current_user_id) then
    raise exception 'Only the ride creator may accept join requests' using errcode = '42501';
  end if;

  if target_request.status <> 'pending' then
    raise exception 'Join request is not pending' using errcode = '22023';
  end if;

  select *
    into target_ride
  from public.rides
  where id = target_request.ride_id
  for update;

  if not found then
    raise exception 'Ride not found' using errcode = 'P0002';
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

  if public.is_ride_member(target_request.ride_id, target_request.user_id) then
    update public.ride_join_requests
    set
      status = 'accepted',
      resolved_at = now(),
      resolved_by = current_user_id
    where id = target_request.id
    returning * into target_request;
    return target_request;
  end if;

  select count(*)::integer
    into current_members
  from public.ride_members
  where ride_id = target_request.ride_id;

  if current_members >= 16 then
    raise exception 'Ride is full' using errcode = '22023';
  end if;

  if public.count_user_live_rides(target_request.user_id, p_local_date) >= 4 then
    raise exception 'That rider is already in 4 active Rides' using errcode = '22023';
  end if;

  insert into public.ride_members (ride_id, user_id, role)
  values (target_request.ride_id, target_request.user_id, 'member');

  update public.ride_join_requests
  set
    status = 'accepted',
    resolved_at = now(),
    resolved_by = current_user_id
  where id = target_request.id
  returning * into target_request;

  return target_request;
end;
$$;

create or replace function public.reject_ride_join_request(p_request_id uuid)
returns public.ride_join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.ride_join_requests;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into target_request
  from public.ride_join_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  if not public.is_ride_creator(target_request.ride_id, current_user_id) then
    raise exception 'Only the ride creator may reject join requests' using errcode = '42501';
  end if;

  if target_request.status <> 'pending' then
    raise exception 'Join request is not pending' using errcode = '22023';
  end if;

  update public.ride_join_requests
  set
    status = 'rejected',
    resolved_at = now(),
    resolved_by = current_user_id
  where id = target_request.id
  returning * into target_request;

  return target_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kick member (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.remove_ride_member(p_ride_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_ride_creator(p_ride_id, current_user_id) then
    raise exception 'Only the ride creator may remove members' using errcode = '42501';
  end if;

  if p_user_id = current_user_id then
    raise exception 'Cannot remove yourself from the Ride' using errcode = '22023';
  end if;

  select role
    into target_role
  from public.ride_members
  where ride_id = p_ride_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if target_role = 'creator' then
    raise exception 'Cannot remove the Ride owner' using errcode = '22023';
  end if;

  delete from public.ride_members
  where ride_id = p_ride_id
    and user_id = p_user_id;
end;
$$;

revoke execute on function public.notify_ride_creator_of_join_request() from public, anon, authenticated;
revoke execute on function public.notify_requester_of_join_decision() from public, anon, authenticated;
revoke execute on function public.accept_ride_join_request(uuid, date) from public, anon;
revoke execute on function public.reject_ride_join_request(uuid) from public, anon;
revoke execute on function public.remove_ride_member(uuid, uuid) from public, anon;

grant execute on function public.accept_ride_join_request(uuid, date) to authenticated;
grant execute on function public.reject_ride_join_request(uuid) to authenticated;
grant execute on function public.remove_ride_member(uuid, uuid) to authenticated;

comment on table public.ride_join_requests is
  'Pending owner approval before a user becomes a ride_members row';

notify pgrst, 'reload schema';
