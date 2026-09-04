-- Early-close challenges when every ride member posts, freeze winner + notify,
-- and block likes/comments on finished challenge posts. Deleting a post never
-- reopens a closed challenge (ends_at is never extended).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.ride_challenges
  add column if not exists winner_user_id uuid
    references public.profiles(id) on delete set null;

comment on column public.ride_challenges.winner_user_id is
  'Frozen winner when the challenge closes early (all members posted). Null until then.';

-- ---------------------------------------------------------------------------
-- Interaction gate: challenge posts writable only while challenge is active
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

-- Reactions
drop policy if exists post_reactions_insert_own on public.post_reactions;
create policy post_reactions_insert_own
on public.post_reactions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

drop policy if exists post_reactions_update_own on public.post_reactions;
create policy post_reactions_update_own
on public.post_reactions
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

drop policy if exists post_reactions_delete_own on public.post_reactions;
create policy post_reactions_delete_own
on public.post_reactions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

-- Comments (direct insert/update/delete; compose path also checked in RPC)
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
on public.comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
on public.comments
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
on public.comments
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_post_ride_member(post_id)
  and public.is_challenge_post_open_for_interaction(post_id)
);

create or replace function public.create_comment_with_mentions(
  p_post_id uuid,
  p_content text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  ride_id uuid;
  cleaned text;
  new_comment_id uuid;
  mention_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  cleaned := btrim(coalesce(p_content, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 2000 then
    raise exception 'Comment must be between 1 and 2000 characters' using errcode = '22023';
  end if;

  if not public.is_post_ride_member(p_post_id, current_user_id) then
    raise exception 'Not a ride member for this post' using errcode = '42501';
  end if;

  if not coalesce(public.is_challenge_post_open_for_interaction(p_post_id), false) then
    raise exception 'This challenge has ended' using errcode = '22023';
  end if;

  select p.ride_id into ride_id
  from public.posts p
  where p.id = p_post_id;

  if ride_id is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  mention_ids := public.resolve_comment_mention_ids(
    ride_id,
    current_user_id,
    cleaned,
    p_mentioned_user_ids
  );

  perform set_config(
    'soloride.pending_mention_ids',
    array_to_string(mention_ids, ','),
    true
  );

  insert into public.comments (post_id, user_id, content)
  values (p_post_id, current_user_id, cleaned)
  returning id into new_comment_id;

  insert into public.comment_mentions (comment_id, mentioned_user_id)
  select new_comment_id, unnest(mention_ids);

  return new_comment_id;
end;
$$;

revoke all on function public.create_comment_with_mentions(uuid, text, uuid[])
  from public, anon;
grant execute on function public.create_comment_with_mentions(uuid, text, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Early close when every ride member has posted
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
  messages jsonb;
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

  closed_ends_at := greatest(challenge_starts_at + interval '1 second', now());

  update public.ride_challenges
  set
    ends_at = closed_ends_at,
    winner_user_id = winner_id
  where id = p_ride_challenge_id
    and ends_at > now();

  if not found then
    return;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', 'Challenge finished',
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
  into messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = challenge_ride_id;

  perform public.send_expo_push_messages(messages);
end;
$$;

revoke all on function public.close_ride_challenge_if_complete(uuid)
  from public, anon, authenticated;

create or replace function public.posts_close_challenge_if_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ride_challenge_id is not null then
    perform public.close_ride_challenge_if_complete(new.ride_challenge_id);
  end if;
  return new;
end;
$$;

revoke all on function public.posts_close_challenge_if_complete()
  from public, anon, authenticated;

drop trigger if exists posts_close_challenge_if_complete on public.posts;
create trigger posts_close_challenge_if_complete
after insert on public.posts
for each row
when (new.ride_challenge_id is not null)
execute function public.posts_close_challenge_if_complete();
