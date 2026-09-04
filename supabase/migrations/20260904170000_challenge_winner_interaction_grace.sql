-- After everyone completes: close submissions, declare winner, notify twice,
-- and keep likes/comments open for 1 hour after winner_declared_at.
-- Timer expiry without a winner still locks interactions immediately.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.ride_challenges
  add column if not exists winner_declared_at timestamptz;

comment on column public.ride_challenges.winner_declared_at is
  'When the winner was frozen. Likes/comments stay open until this + 1 hour.';

-- Existing early-closed rows: treat ends_at as declaration time.
update public.ride_challenges
set winner_declared_at = ends_at
where winner_user_id is not null
  and winner_declared_at is null;

-- ---------------------------------------------------------------------------
-- Interaction gate: active window OR 1h after winner declaration
-- ---------------------------------------------------------------------------

create or replace function public.is_challenge_post_open_for_interaction(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.ride_challenge_id is null then true
    when rc.ends_at > now() then true
    when rc.winner_user_id is not null
      and coalesce(rc.winner_declared_at, rc.ends_at) + interval '1 hour' > now()
      then true
    else false
  end
  from public.posts p
  left join public.ride_challenges rc on rc.id = p.ride_challenge_id
  where p.id = p_post_id;
$$;

revoke all on function public.is_challenge_post_open_for_interaction(uuid)
  from public, anon, authenticated;
grant execute on function public.is_challenge_post_open_for_interaction(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Early close: dual notify (everyone done + winner)
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

  select count(distinct p.user_id)::integer
    into completer_count
  from public.posts p
  where p.ride_challenge_id = p_ride_challenge_id;

  if completer_count < member_count then
    return;
  end if;

  -- Same ranking as compareChallengeEntries: score sum → positive count → newer.
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
