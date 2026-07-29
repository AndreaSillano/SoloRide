-- Funnier social push copy when someone posts to a Ride.

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
begin
  select coalesce(nullif(btrim(p.display_name), ''), p.username), r.name
  into author_name, ride_name
  from public.profiles p
  join public.rides r on r.id = new.ride_id
  where p.id = new.user_id;

  if coalesce(new.is_temporary, false) then
    push_title := '24h solo arc';
    push_body := format(
      '%s has made another (temporary) step on their Solo Ride in %s',
      coalesce(author_name, 'Someone'),
      coalesce(ride_name, 'your Ride')
    );
  else
    push_title := 'Solo arc update';
    push_body := format(
      '%s has made another step on their Solo Ride in %s',
      coalesce(author_name, 'Someone'),
      coalesce(ride_name, 'your Ride')
    );
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
