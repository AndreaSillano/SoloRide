-- Submissions close at ends_at (timer or early-close). Challenge stays visible
-- and likes/comments stay open for 1 more hour, then the winner is elected and
-- persisted on ride_challenges for metrics.

-- ---------------------------------------------------------------------------
-- Schema: also store winning post for metrics
-- ---------------------------------------------------------------------------

alter table public.ride_challenges
  add column if not exists winner_post_id uuid
    references public.posts(id) on delete set null;

comment on column public.ride_challenges.winner_user_id is
  'Elected winner after the 1h post-close reaction window. Null until then.';

comment on column public.ride_challenges.winner_declared_at is
  'When the winner was frozen (ends_at + 1 hour). Interactions lock at this instant.';

comment on column public.ride_challenges.winner_post_id is
  'Winning challenge post at election time (null if post was deleted).';

create index if not exists ride_challenges_winner_user_idx
  on public.ride_challenges (winner_user_id)
  where winner_user_id is not null;

create index if not exists ride_challenges_pending_finalize_idx
  on public.ride_challenges (ends_at)
  where winner_user_id is null;

-- ---------------------------------------------------------------------------
-- Visibility / interaction: open until ends_at + 1 hour
-- ---------------------------------------------------------------------------

create or replace function public.ride_challenge_interaction_ends_at(
  p_ends_at timestamptz
)
returns timestamptz
language sql
immutable
as $$
  select p_ends_at + interval '1 hour';
$$;

revoke all on function public.ride_challenge_interaction_ends_at(timestamptz)
  from public, anon, authenticated;
grant execute on function public.ride_challenge_interaction_ends_at(timestamptz)
  to authenticated;

create or replace function public.is_ride_challenge_open_for_interaction(
  p_ride_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when rc.id is null then false
    when public.ride_challenge_interaction_ends_at(rc.ends_at) > now() then true
    else false
  end
  from public.ride_challenges rc
  where rc.id = p_ride_challenge_id;
$$;

revoke all on function public.is_ride_challenge_open_for_interaction(uuid)
  from public, anon, authenticated;
grant execute on function public.is_ride_challenge_open_for_interaction(uuid)
  to authenticated;

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
    when public.is_ride_challenge_open_for_interaction(p.ride_challenge_id) then true
    else false
  end
  from public.posts p
  where p.id = p_post_id;
$$;

revoke all on function public.is_challenge_post_open_for_interaction(uuid)
  from public, anon, authenticated;
grant execute on function public.is_challenge_post_open_for_interaction(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Rank helper (score sum → positive count → newer)
-- ---------------------------------------------------------------------------

create or replace function public.pick_ride_challenge_winner(
  p_ride_challenge_id uuid
)
returns table (winner_user_id uuid, winner_post_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  picked_user uuid;
  picked_post uuid;
begin
  select ranked.user_id, ranked.id
    into picked_user, picked_post
  from (
    select
      p.user_id,
      p.id,
      coalesce(sum(pr.score), 0) as score_sum,
      count(pr.id) filter (where pr.score > 0) as positive_count,
      p.created_at
    from public.posts p
    left join public.post_reactions pr on pr.post_id = p.id
    where p.ride_challenge_id = p_ride_challenge_id
    group by p.id, p.user_id, p.created_at
    order by score_sum desc, positive_count desc, p.created_at desc, p.id desc
    limit 1
  ) ranked;

  if picked_user is null then
    select rcc.user_id, rcc.post_id
      into picked_user, picked_post
    from public.ride_challenge_completions rcc
    where rcc.ride_challenge_id = p_ride_challenge_id
    order by rcc.completed_at asc
    limit 1;
  end if;

  if picked_user is null then
    return;
  end if;

  winner_user_id := picked_user;
  winner_post_id := picked_post;
  return next;
end;
$$;

revoke all on function public.pick_ride_challenge_winner(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Early close: stop submissions only; keep visible for 1h reaction window
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
  closed_ends_at timestamptz;
  completed_messages jsonb;
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

  -- Already past submission window — never reopen / re-notify.
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

  closed_ends_at := greatest(challenge_starts_at + interval '1 second', now());

  update public.ride_challenges
  set ends_at = closed_ends_at
  where id = p_ride_challenge_id
    and ends_at > now();

  if not found then
    return;
  end if;

  -- Submissions closed; reactions stay open for 1h, then cron elects winner.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Challenge complete',
        'body', format(
          'Everyone finished %s · %s — 1h left to react',
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
end;
$$;

revoke all on function public.close_ride_challenge_if_complete(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Elect + persist winner after the 1h reaction window
-- ---------------------------------------------------------------------------

create or replace function public.finalize_ride_challenge_winner(
  p_ride_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  challenge_ride_id uuid;
  challenge_ends_at timestamptz;
  existing_winner uuid;
  challenge_title text;
  ride_name text;
  winner_id uuid;
  winner_post uuid;
  winner_label text;
  declared_at timestamptz;
  winner_messages jsonb;
begin
  select rc.ride_id, rc.ends_at, rc.winner_user_id, c.title, r.name
    into challenge_ride_id, challenge_ends_at, existing_winner,
         challenge_title, ride_name
  from public.ride_challenges rc
  join public.challenges c on c.id = rc.challenge_id
  join public.rides r on r.id = rc.ride_id
  where rc.id = p_ride_challenge_id
  for update of rc;

  if challenge_ride_id is null then
    return false;
  end if;

  if existing_winner is not null then
    return false;
  end if;

  -- Wait until the reaction window ends.
  if public.ride_challenge_interaction_ends_at(challenge_ends_at) > now() then
    return false;
  end if;

  select w.winner_user_id, w.winner_post_id
    into winner_id, winner_post
  from public.pick_ride_challenge_winner(p_ride_challenge_id) w;

  if winner_id is null then
    -- No entries: mark declared so we do not retry forever.
    update public.ride_challenges
    set winner_declared_at = coalesce(winner_declared_at, now())
    where id = p_ride_challenge_id
      and winner_user_id is null;
    return false;
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

  update public.ride_challenges
  set
    winner_user_id = winner_id,
    winner_post_id = winner_post,
    winner_declared_at = declared_at
  where id = p_ride_challenge_id
    and winner_user_id is null;

  if not found then
    return false;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Winner declared',
        'body', format(
          '%s won %s · %s',
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
  return true;
end;
$$;

revoke all on function public.finalize_ride_challenge_winner(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_ride_challenge_winner(uuid)
  to service_role;

create or replace function public.finalize_due_ride_challenge_winners()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  finalized integer := 0;
begin
  for rec in
    select rc.id
    from public.ride_challenges rc
    where rc.winner_user_id is null
      and public.ride_challenge_interaction_ends_at(rc.ends_at) <= now()
      -- Skip empty challenges that were already stamped without a winner.
      and (
        rc.winner_declared_at is null
        or exists (
          select 1
          from public.ride_challenge_completions rcc
          where rcc.ride_challenge_id = rc.id
        )
        or exists (
          select 1
          from public.posts p
          where p.ride_challenge_id = rc.id
        )
      )
    order by rc.ends_at asc
    limit 200
  loop
    if public.finalize_ride_challenge_winner(rec.id) then
      finalized := finalized + 1;
    end if;
  end loop;

  return finalized;
end;
$$;

revoke all on function public.finalize_due_ride_challenge_winners()
  from public, anon, authenticated;
grant execute on function public.finalize_due_ride_challenge_winners()
  to service_role;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
  perform cron.unschedule('finalize-ride-challenge-winners');
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'finalize-ride-challenge-winners',
    '*/5 * * * *',
    $cron$ select public.finalize_due_ride_challenge_winners(); $cron$
  );
exception
  when undefined_table then null;
  when undefined_function then null;
  when others then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Block opening a new challenge during the reaction grace window
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
      and public.ride_challenge_interaction_ends_at(rc.ends_at) > now()
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
          and public.ride_challenge_interaction_ends_at(rc.ends_at) > now()
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
        null;
    end;
  end loop;

  return opened_count;
end;
$$;

revoke all on function public.open_due_auto_challenges()
  from public, anon, authenticated;
grant execute on function public.open_due_auto_challenges() to service_role;

-- Backfill winners for challenges whose reaction window already ended.
select public.finalize_due_ride_challenge_winners();
