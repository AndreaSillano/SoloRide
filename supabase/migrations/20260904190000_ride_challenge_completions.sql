-- Permanent per-challenge unlock: posting to a challenge records a completion
-- that survives post delete. Early-close counts completions, not live posts.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists public.ride_challenge_completions (
  ride_challenge_id uuid not null
    references public.ride_challenges(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  post_id uuid
    references public.posts(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (ride_challenge_id, user_id)
);

create index if not exists ride_challenge_completions_user_idx
  on public.ride_challenge_completions (user_id);

create index if not exists ride_challenge_completions_post_idx
  on public.ride_challenge_completions (post_id)
  where post_id is not null;

comment on table public.ride_challenge_completions is
  'Durable unlock/completion for a ride challenge. Inserted on first challenge post; never deleted when the post is removed.';

-- ---------------------------------------------------------------------------
-- RLS: ride members can read; writes only via security definer triggers
-- ---------------------------------------------------------------------------

alter table public.ride_challenge_completions enable row level security;

drop policy if exists ride_challenge_completions_select_members
  on public.ride_challenge_completions;
create policy ride_challenge_completions_select_members
on public.ride_challenge_completions
for select
to authenticated
using (
  exists (
    select 1
    from public.ride_challenges rc
    where rc.id = ride_challenge_id
      and public.is_ride_member(rc.ride_id)
  )
);

grant select on table public.ride_challenge_completions to authenticated;

-- ---------------------------------------------------------------------------
-- Record completion (idempotent upsert)
-- ---------------------------------------------------------------------------

create or replace function public.record_ride_challenge_completion(
  p_post_id uuid,
  p_ride_challenge_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ride_challenge_id is null or p_user_id is null then
    return;
  end if;

  insert into public.ride_challenge_completions (
    ride_challenge_id,
    user_id,
    post_id,
    completed_at
  )
  values (
    p_ride_challenge_id,
    p_user_id,
    p_post_id,
    now()
  )
  on conflict (ride_challenge_id, user_id) do update
  set post_id = coalesce(
    public.ride_challenge_completions.post_id,
    excluded.post_id
  );
end;
$$;

revoke all on function public.record_ride_challenge_completion(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill from existing challenge posts
-- ---------------------------------------------------------------------------

insert into public.ride_challenge_completions (
  ride_challenge_id,
  user_id,
  post_id,
  completed_at
)
select distinct on (p.ride_challenge_id, p.user_id)
  p.ride_challenge_id,
  p.user_id,
  p.id,
  p.created_at
from public.posts p
where p.ride_challenge_id is not null
order by p.ride_challenge_id, p.user_id, p.created_at asc
on conflict (ride_challenge_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Early close: count durable completions
-- ---------------------------------------------------------------------------

create or replace function public.close_ride_challenge_if_complete(
  p_ride_challenge_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  challenge_ride_id uuid;
  challenge_ends_at timestamptz;
  challenge_starts_at timestamptz;
  challenge_title text;
  ride_name text;
  member_count integer;
  completer_count integer;
  winner_id uuid;
  winner_label text;
  closed_ends_at timestamptz;
  declared_at timestamptz;
  completed_messages jsonb;
  winner_messages jsonb;
begin
  select rc.ride_id, rc.ends_at, rc.starts_at, c.title, r.name
    into challenge_ride_id, challenge_ends_at, challenge_starts_at,
         challenge_title, ride_name
  from public.ride_challenges rc
  join public.challenges c on c.id = rc.challenge_id
  join public.rides r on r.id = rc.ride_id
  where rc.id = p_ride_challenge_id
  for update of rc;

  if challenge_ride_id is null then
    return;
  end if;

  -- Already finished — never reopen / re-notify.
  if challenge_ends_at <= now() then
    return;
  end if;

  select count(*)::integer
    into member_count
  from public.ride_members
  where ride_id = challenge_ride_id;

  if member_count < 1 then
    return;
  end if;

  select count(*)::integer
    into completer_count
  from public.ride_challenge_completions
  where ride_challenge_id = p_ride_challenge_id;

  if completer_count < member_count then
    return;
  end if;

  -- Same ranking as compareChallengeEntries: score sum → positive count → newer.
  -- Prefer live posts; fall back to completion.user_id if the post was deleted.
  select ranked.user_id
    into winner_id
  from (
    select
      p.user_id,
      coalesce(sum(pr.score), 0) as score_sum,
      count(pr.id) filter (where pr.score > 0) as positive_count,
      p.created_at,
      p.id
    from public.posts p
    left join public.post_reactions pr on pr.post_id = p.id
    where p.ride_challenge_id = p_ride_challenge_id
    group by p.id, p.user_id, p.created_at
    order by score_sum desc, positive_count desc, p.created_at desc, p.id desc
    limit 1
  ) ranked;

  if winner_id is null then
    select rcc.user_id
      into winner_id
    from public.ride_challenge_completions rcc
    where rcc.ride_challenge_id = p_ride_challenge_id
    order by rcc.completed_at asc
    limit 1;
  end if;

  if winner_id is null then
    return;
  end if;

  select coalesce(
    nullif(btrim(pr.display_name), ''),
    nullif(btrim(pr.username), ''),
    'Someone'
  )
    into winner_label
  from public.profiles pr
  where pr.id = winner_id;

  declared_at := now();
  closed_ends_at := greatest(challenge_starts_at + interval '1 second', declared_at);

  update public.ride_challenges
  set
    ends_at = closed_ends_at,
    winner_user_id = winner_id,
    winner_declared_at = declared_at
  where id = p_ride_challenge_id
    and ends_at > now();

  if not found then
    return;
  end if;

  -- 1) Everyone completed
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Challenge complete',
        'body', format(
          'Everyone finished %s · %s',
          coalesce(challenge_title, 'the challenge'),
          coalesce(ride_name, 'your Ride')
        ),
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'ride_challenge_completed',
          'rideId', challenge_ride_id,
          'rideChallengeId', p_ride_challenge_id
        )
      )
    ),
    '[]'::jsonb
  )
  into completed_messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = challenge_ride_id;

  perform public.send_expo_push_messages(completed_messages);

  -- 2) Winner declared (interactions stay open for 1 more hour)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Winner declared',
        'body', format(
          '%s won %s · %s — 1h left to react',
          coalesce(winner_label, 'Someone'),
          coalesce(challenge_title, 'the challenge'),
          coalesce(ride_name, 'your Ride')
        ),
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'ride_challenge_finished',
          'rideId', challenge_ride_id,
          'rideChallengeId', p_ride_challenge_id
        )
      )
    ),
    '[]'::jsonb
  )
  into winner_messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = challenge_ride_id;

  perform public.send_expo_push_messages(winner_messages);
end;
$$;

revoke all on function public.close_ride_challenge_if_complete(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Insert path: record unlock, then maybe early-close
-- ---------------------------------------------------------------------------

create or replace function public.posts_close_challenge_if_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ride_challenge_id is not null then
    perform public.record_ride_challenge_completion(
      new.id,
      new.ride_challenge_id,
      new.user_id
    );
    perform public.close_ride_challenge_if_complete(new.ride_challenge_id);
  end if;
  return new;
end;
$$;

revoke all on function public.posts_close_challenge_if_complete()
  from public, anon, authenticated;
