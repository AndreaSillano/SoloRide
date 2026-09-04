-- Durable per-day cadence unlock: posting a non-challenge permanent records an
-- unlock that survives post delete. Media spoiler uses max(scheduled_date) as
-- a watermark so only newer days stay locked.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.ride_cadence_unlocks (
  ride_id uuid not null
    references public.rides(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  post_id uuid
    references public.posts(id) on delete set null,
  unlocked_at timestamptz not null default now(),
  primary key (ride_id, user_id, scheduled_date)
);

create index if not exists ride_cadence_unlocks_user_idx
  on public.ride_cadence_unlocks (user_id);

create index if not exists ride_cadence_unlocks_post_idx
  on public.ride_cadence_unlocks (post_id)
  where post_id is not null;

comment on table public.ride_cadence_unlocks is
  'Durable cadence unlock for a ride day. Inserted on first cadence permanent; never deleted when the post is removed.';

-- ---------------------------------------------------------------------------
-- RLS: ride members can read; writes only via security definer triggers
-- ---------------------------------------------------------------------------

alter table public.ride_cadence_unlocks enable row level security;

drop policy if exists ride_cadence_unlocks_select_members
  on public.ride_cadence_unlocks;
create policy ride_cadence_unlocks_select_members
on public.ride_cadence_unlocks
for select
to authenticated
using (public.is_ride_member(ride_id));

grant select on table public.ride_cadence_unlocks to authenticated;

-- ---------------------------------------------------------------------------
-- Record unlock (idempotent upsert)
-- ---------------------------------------------------------------------------

create or replace function public.record_ride_cadence_unlock(
  p_post_id uuid,
  p_ride_id uuid,
  p_user_id uuid,
  p_scheduled_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ride_id is null
     or p_user_id is null
     or p_scheduled_date is null then
    return;
  end if;

  insert into public.ride_cadence_unlocks (
    ride_id,
    user_id,
    scheduled_date,
    post_id,
    unlocked_at
  )
  values (
    p_ride_id,
    p_user_id,
    p_scheduled_date,
    p_post_id,
    now()
  )
  on conflict (ride_id, user_id, scheduled_date) do update
  set post_id = coalesce(
    public.ride_cadence_unlocks.post_id,
    excluded.post_id
  );
end;
$$;

revoke all on function public.record_ride_cadence_unlock(uuid, uuid, uuid, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill from existing cadence permanents
-- ---------------------------------------------------------------------------

insert into public.ride_cadence_unlocks (
  ride_id,
  user_id,
  scheduled_date,
  post_id,
  unlocked_at
)
select distinct on (p.ride_id, p.user_id, p.scheduled_date)
  p.ride_id,
  p.user_id,
  p.scheduled_date,
  p.id,
  p.created_at
from public.posts p
where p.is_temporary = false
  and p.ride_challenge_id is null
  and p.scheduled_date is not null
order by p.ride_id, p.user_id, p.scheduled_date, p.created_at asc
on conflict (ride_id, user_id, scheduled_date) do nothing;

-- ---------------------------------------------------------------------------
-- Insert path: record cadence unlock for non-challenge permanents
-- ---------------------------------------------------------------------------

create or replace function public.posts_record_cadence_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_temporary = false and new.ride_challenge_id is null then
    perform public.record_ride_cadence_unlock(
      new.id,
      new.ride_id,
      new.user_id,
      new.scheduled_date
    );
  end if;
  return new;
end;
$$;

revoke all on function public.posts_record_cadence_unlock()
  from public, anon, authenticated;

drop trigger if exists posts_record_cadence_unlock on public.posts;
create trigger posts_record_cadence_unlock
after insert on public.posts
for each row
execute function public.posts_record_cadence_unlock();
