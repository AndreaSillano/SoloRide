-- Challenge duration lives on the catalog row (hardcoded per challenge).
-- Opening a ride challenge uses challenges.duration for ends_at.

alter table public.challenges
  add column if not exists duration interval not null default interval '24 hours';

alter table public.challenges
  drop constraint if exists challenges_duration_positive;

alter table public.challenges
  add constraint challenges_duration_positive
  check (duration >= interval '1 minute' and duration <= interval '7 days');

comment on column public.challenges.duration is
  'How long a ride challenge stays open when this catalog entry is used.';

-- Prefer catalog duration over a call-time parameter.
drop function if exists public.open_ride_challenge(uuid, uuid, integer);
drop function if exists public.insert_ride_challenge(uuid, uuid, text, uuid, integer);
drop function if exists public.open_ride_challenge(uuid, uuid);
drop function if exists public.insert_ride_challenge(uuid, uuid, text, uuid);

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
  challenge_duration interval;
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

  select c.duration
    into challenge_duration
  from public.challenges c
  where c.id = p_challenge_id
    and c.is_active = true;

  if challenge_duration is null then
    raise exception 'Challenge not found or inactive' using errcode = '23503';
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
    now() + challenge_duration,
    p_source,
    p_opened_by_user_id
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.insert_ride_challenge(uuid, uuid, text, uuid)
  from public, anon, authenticated;

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

revoke all on function public.open_ride_challenge(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.open_ride_challenge(uuid, uuid)
  to authenticated;

comment on table public.ride_challenges is
  'Timed challenge instances opened for a ride (ends_at from challenges.duration).';
