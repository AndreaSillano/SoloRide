-- Central push-notification copy catalog.
-- Edit strings in supabase/notification_copy.sql after this migration is applied.

create table if not exists public.push_notification_copy (
  id bigint generated always as identity primary key,
  kind text not null,
  title text not null,
  body text not null,
  constraint push_notification_copy_kind_check check (char_length(kind) between 1 and 64),
  constraint push_notification_copy_title_check check (char_length(title) between 1 and 120),
  constraint push_notification_copy_body_check check (char_length(body) between 1 and 280)
);

create index if not exists push_notification_copy_kind_idx
  on public.push_notification_copy (kind);

alter table public.push_notification_copy enable row level security;

revoke all on table public.push_notification_copy from public, anon, authenticated;
grant select, insert, update, delete on table public.push_notification_copy to service_role;

comment on table public.push_notification_copy is
  'Editable push title/body variants. Placeholders: {author} {ride} {challenge} {winner} {snippet} {name}.';

create or replace function public.pick_push_copy(
  p_kind text,
  p_vars jsonb default '{}'::jsonb
)
returns table(title text, body text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  picked_title text;
  picked_body text;
  var_key text;
  var_value text;
begin
  select c.title, c.body
    into picked_title, picked_body
  from public.push_notification_copy c
  where c.kind = p_kind
  order by random()
  limit 1;

  if picked_title is null then
    title := p_kind;
    body := '';
    return next;
    return;
  end if;

  for var_key, var_value in
    select * from jsonb_each_text(coalesce(p_vars, '{}'::jsonb))
  loop
    picked_title := replace(picked_title, '{' || var_key || '}', coalesce(var_value, ''));
    picked_body := replace(picked_body, '{' || var_key || '}', coalesce(var_value, ''));
  end loop;

  title := picked_title;
  body := picked_body;
  return next;
end;
$$;

revoke all on function public.pick_push_copy(text, jsonb) from public, anon, authenticated;
grant execute on function public.pick_push_copy(text, jsonb) to service_role;

-- Seed (keep in sync with supabase/notification_copy.sql)
truncate table public.push_notification_copy;

insert into public.push_notification_copy (kind, title, body) values
  ('post_temporary', '24h solo arc', '{author} has made another (temporary) step on Solo Ride in {ride}'),
  ('post_temporary', 'Here for a day', '{author} dropped a 24h post in {ride}'),
  ('post_temporary', 'Fleeting fame', 'Blink and you’ll miss {author} in {ride}'),
  ('post_permanent', 'Solo arc update', '{author} has made another step on Solo Ride in {ride}'),
  ('post_permanent', 'New chapter', '{author} just showed up in {ride}'),
  ('post_permanent', 'Ride check-in', '{author} posted in {ride} — go look'),
  ('comment', 'New comment', '{author} commented on your photo in {ride}'),
  ('comment', 'Someone’s talking', '{author} left a note on your post in {ride}'),
  ('comment', 'Reply incoming', 'Your photo in {ride} got a comment from {author}'),
  ('mention', 'You were tagged', '{author} mentioned you in a comment in {ride}'),
  ('mention', 'Mentioned you', '{author} tagged you in {ride}'),
  ('mention', 'You’re in it', '{author}: {snippet}'),
  ('join_request', '{name}', 'wants to join {ride}'),
  ('join_accepted', '{name}', 'accepted you into {ride}'),
  ('join_declined', '{name}', 'declined your request to join {ride}'),
  ('challenge_opened', 'New challenge', '{challenge} · {ride}'),
  ('challenge_complete', 'Challenge complete', 'Everyone finished {challenge} · {ride} — 1h left to react'),
  ('challenge_winner', 'Winner declared', '{winner} won {challenge} · {ride}');

-- ---------------------------------------------------------------------------
-- Notify helpers: read copy from the catalog
-- ---------------------------------------------------------------------------

create or replace function public.notify_ride_members_of_new_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  author_name text;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
  copy_kind text;
begin
  select coalesce(nullif(btrim(p.display_name), ''), p.username), r.name
    into author_name, ride_name
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  author_name := coalesce(author_name, 'Someone');
  ride_name := coalesce(ride_name, 'your Ride');
  copy_kind := case
    when coalesce(new.is_temporary, false) then 'post_temporary'
    else 'post_permanent'
  end;

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    copy_kind,
    jsonb_build_object('author', author_name, 'ride', ride_name)
  ) c;

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

create or replace function public.notify_post_author_of_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  commenter_name text;
  post_author_id uuid;
  ride_id uuid;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
  pending_mentions text;
begin
  select
    p.user_id,
    p.ride_id,
    r.name,
    coalesce(nullif(btrim(c.display_name), ''), c.username)
  into post_author_id, ride_id, ride_name, commenter_name
  from public.posts p
  join public.rides r on r.id = p.ride_id
  join public.profiles c on c.id = new.user_id
  where p.id = new.post_id;

  if post_author_id is null or post_author_id = new.user_id then
    return new;
  end if;

  pending_mentions := nullif(current_setting('soloride.pending_mention_ids', true), '');
  if pending_mentions is not null
     and post_author_id::text = any(string_to_array(pending_mentions, ',')) then
    return new;
  end if;

  if exists (
    select 1
    from public.comment_mentions cm
    where cm.comment_id = new.id
      and cm.mentioned_user_id = post_author_id
  ) then
    return new;
  end if;

  commenter_name := coalesce(commenter_name, 'Someone');
  ride_name := coalesce(ride_name, 'your Ride');

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'comment',
    jsonb_build_object('author', commenter_name, 'ride', ride_name)
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
        'sound', 'default',
        'badge', 1,
        'data', jsonb_build_object(
          'kind', 'social_comment',
          'rideId', ride_id,
          'postId', new.post_id,
          'commentId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  where pt.user_id = post_author_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_mentioned_users_of_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  commenter_id uuid;
  commenter_name text;
  post_id uuid;
  ride_id uuid;
  ride_name text;
  comment_snippet text;
  messages jsonb;
  push_title text;
  push_body text;
begin
  select
    c.user_id,
    c.post_id,
    c.content,
    p.ride_id,
    r.name,
    coalesce(nullif(btrim(pr.display_name), ''), pr.username)
  into commenter_id, post_id, comment_snippet, ride_id, ride_name, commenter_name
  from public.comments c
  join public.posts p on p.id = c.post_id
  join public.rides r on r.id = p.ride_id
  join public.profiles pr on pr.id = c.user_id
  where c.id = new.comment_id;

  if commenter_id is null or new.mentioned_user_id = commenter_id then
    return new;
  end if;

  commenter_name := coalesce(commenter_name, 'Someone');
  ride_name := coalesce(ride_name, 'your Ride');
  comment_snippet := left(btrim(coalesce(comment_snippet, '')), 80);

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'mention',
    jsonb_build_object(
      'author', commenter_name,
      'ride', ride_name,
      'snippet', comment_snippet
    )
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
        'sound', 'default',
        'badge', 1,
        'data', jsonb_build_object(
          'kind', 'social_mention',
          'rideId', ride_id,
          'postId', post_id,
          'commentId', new.comment_id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  where pt.user_id = new.mentioned_user_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_ride_creator_of_join_request()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requester_name text;
  requester_avatar text;
  ride_name text;
  creator_id uuid;
  messages jsonb;
  push_title text;
  push_body text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'Someone'),
    nullif(btrim(p.avatar_url), ''),
    r.name,
    r.creator_id
  into requester_name, requester_avatar, ride_name, creator_id
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  if creator_id is null or creator_id = new.user_id then
    return new;
  end if;

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'join_request',
    jsonb_build_object(
      'name', requester_name,
      'ride', coalesce(ride_name, 'your Ride')
    )
  ) c;

  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into messages
  from (
    select
      jsonb_strip_nulls(
        jsonb_build_object(
          'to', pt.token,
          'title', push_title,
          'body', push_body,
          'sound', 'default',
          'badge', 1,
          'data', jsonb_build_object(
            'kind', 'join_request',
            'rideId', new.ride_id,
            'requestId', new.id
          ),
          'richContent', case
            when requester_avatar is not null then
              jsonb_build_object('image', requester_avatar)
            else null
          end
        )
      ) as payload
    from public.push_tokens pt
    where pt.user_id = creator_id
  ) as payloads;

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
  owner_name text;
  owner_avatar text;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
  copy_kind text;
begin
  if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.username), ''), 'The owner'),
    nullif(btrim(p.avatar_url), ''),
    r.name
  into owner_name, owner_avatar, ride_name
  from public.rides r
  join public.profiles p on p.id = r.creator_id
  where r.id = new.ride_id;

  copy_kind := case
    when new.status = 'accepted' then 'join_accepted'
    else 'join_declined'
  end;

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    copy_kind,
    jsonb_build_object(
      'name', owner_name,
      'ride', coalesce(ride_name, 'the Ride')
    )
  ) c;

  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into messages
  from (
    select
      jsonb_strip_nulls(
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
          ),
          'richContent', case
            when owner_avatar is not null then
              jsonb_build_object('image', owner_avatar)
            else null
          end
        )
      ) as payload
    from public.push_tokens pt
    where pt.user_id = new.user_id
  ) as payloads;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

create or replace function public.notify_ride_members_of_challenge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  challenge_title text;
  ride_name text;
  messages jsonb;
  push_title text;
  push_body text;
begin
  select c.title, r.name
  into challenge_title, ride_name
  from public.challenges c
  join public.rides r on r.id = new.ride_id
  where c.id = new.challenge_id;

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'challenge_opened',
    jsonb_build_object(
      'challenge', coalesce(challenge_title, 'Challenge'),
      'ride', coalesce(ride_name, 'your Ride')
    )
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
        'sound', 'default',
        'data', jsonb_build_object(
          'kind', 'ride_challenge',
          'rideId', new.ride_id,
          'rideChallengeId', new.id
        )
      )
    ),
    '[]'::jsonb
  )
  into messages
  from public.push_tokens pt
  join public.ride_members rm on rm.user_id = pt.user_id
  where rm.ride_id = new.ride_id;

  perform public.send_expo_push_messages(messages);
  return new;
end;
$$;

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
  push_title text;
  push_body text;
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

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'challenge_complete',
    jsonb_build_object(
      'challenge', coalesce(challenge_title, 'the challenge'),
      'ride', coalesce(ride_name, 'your Ride')
    )
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
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
  push_title text;
  push_body text;
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

  if public.ride_challenge_interaction_ends_at(challenge_ends_at) > now() then
    return false;
  end if;

  select w.winner_user_id, w.winner_post_id
    into winner_id, winner_post
  from public.pick_ride_challenge_winner(p_ride_challenge_id) w;

  if winner_id is null then
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

  select c.title, c.body
    into push_title, push_body
  from public.pick_push_copy(
    'challenge_winner',
    jsonb_build_object(
      'winner', coalesce(winner_label, 'Someone'),
      'challenge', coalesce(challenge_title, 'the challenge'),
      'ride', coalesce(ride_name, 'your Ride')
    )
  ) c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'to', pt.token,
        'title', push_title,
        'body', push_body,
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

revoke all on function public.notify_ride_members_of_new_post() from public, anon, authenticated;
revoke all on function public.notify_post_author_of_new_comment() from public, anon, authenticated;
revoke all on function public.notify_mentioned_users_of_comment() from public, anon, authenticated;
revoke execute on function public.notify_ride_creator_of_join_request() from public, anon, authenticated;
revoke execute on function public.notify_requester_of_join_decision() from public, anon, authenticated;
revoke all on function public.notify_ride_members_of_challenge() from public, anon, authenticated;
revoke all on function public.close_ride_challenge_if_complete(uuid) from public, anon, authenticated;
revoke all on function public.finalize_ride_challenge_winner(uuid) from public, anon, authenticated;
grant execute on function public.finalize_ride_challenge_winner(uuid) to service_role;
