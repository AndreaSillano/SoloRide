-- Rotate social push titles/bodies so each alert is not identical copy.

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
  titles text[];
  bodies text[];
  idx int;
  push_title text;
  push_body text;
begin
  select coalesce(nullif(btrim(p.display_name), ''), p.username), r.name
  into author_name, ride_name
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  author_name := coalesce(author_name, 'Someone');
  ride_name := coalesce(ride_name, 'your Ride');

  if coalesce(new.is_temporary, false) then
    titles := array[
      '24h solo arc',
      'Here for a day',
      'Fleeting fame'
    ];
    bodies := array[
      format('%s has made another (temporary) step on Solo Ride in %s', author_name, ride_name),
      format('%s dropped a 24h post in %s', author_name, ride_name),
      format('Blink and you’ll miss %s in %s', author_name, ride_name)
    ];
  else
    titles := array[
      'Solo arc update',
      'New chapter',
      'Ride check-in'
    ];
    bodies := array[
      format('%s has made another step on Solo Ride in %s', author_name, ride_name),
      format('%s just showed up in %s', author_name, ride_name),
      format('%s posted in %s — go look', author_name, ride_name)
    ];
  end if;

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
  titles text[];
  bodies text[];
  idx int;
  push_title text;
  push_body text;
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
