-- Comment @mentions: structured rows + push when tagged.

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

create index comment_mentions_mentioned_user_id_idx
  on public.comment_mentions (mentioned_user_id);

alter table public.comment_mentions enable row level security;

create policy comment_mentions_select_members
on public.comment_mentions
for select
to authenticated
using (
  exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and public.is_post_ride_member(c.post_id)
  )
);

grant select on table public.comment_mentions to authenticated;

-- Resolve ride-member mention targets from explicit IDs + @username tokens.
create or replace function public.resolve_comment_mention_ids(
  p_ride_id uuid,
  p_author_id uuid,
  p_content text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(uid), '{}'::uuid[])
  from (
    select distinct candidates.uid
    from (
      select unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) as uid
      union
      select p.id
      from regexp_matches(
        coalesce(p_content, ''),
        '@([a-z0-9](?:[a-z0-9_]*[a-z0-9])?)',
        'gi'
      ) as match
      join public.profiles p
        on p.username_normalized = lower(match[1])
    ) candidates
    join public.ride_members rm
      on rm.ride_id = p_ride_id
     and rm.user_id = candidates.uid
    where candidates.uid is not null
      and candidates.uid <> p_author_id
    limit 10
  ) limited(uid);
$$;

revoke all on function public.resolve_comment_mention_ids(uuid, uuid, text, uuid[])
  from public, anon, authenticated;

-- Atomic comment + mentions.
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

  -- Lets the deferred comment-author trigger skip when the author is tagged.
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

-- Defer author notify until mentions exist in this transaction.
drop trigger if exists comments_notify_author on public.comments;

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
  titles text[];
  bodies text[];
  idx int;
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

  -- Prefer a mention push when the post author was tagged.
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

  titles := array[
    'New comment',
    'Someone’s talking',
    'Reply incoming'
  ];
  bodies := array[
    format('%s commented on your photo in %s', commenter_name, ride_name),
    format('%s left a note on your post in %s', commenter_name, ride_name),
    format('Your photo in %s got a comment from %s', ride_name, commenter_name)
  ];

  idx := 1 + floor(random() * array_length(bodies, 1))::int;
  push_title := titles[idx];
  push_body := bodies[idx];

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

create constraint trigger comments_notify_author
after insert on public.comments
deferrable initially deferred
for each row
execute function public.notify_post_author_of_new_comment();

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
  titles text[];
  bodies text[];
  idx int;
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

  titles := array[
    'You were tagged',
    'Mentioned you',
    'You’re in it'
  ];
  bodies := array[
    format('%s mentioned you in a comment in %s', commenter_name, ride_name),
    format('%s tagged you in %s', commenter_name, ride_name),
    format('%s: %s', commenter_name, comment_snippet)
  ];

  idx := 1 + floor(random() * array_length(bodies, 1))::int;
  push_title := titles[idx];
  push_body := bodies[idx];

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

revoke all on function public.notify_mentioned_users_of_comment()
  from public, anon, authenticated;

create trigger comment_mentions_notify_user
after insert on public.comment_mentions
for each row
execute function public.notify_mentioned_users_of_comment();
