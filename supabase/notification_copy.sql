-- =============================================================================
-- EDIT PUSH NOTIFICATION COPY HERE
-- =============================================================================
-- Placeholders: {author} {ride} {challenge} {winner} {snippet} {name}
-- One random row per kind is picked when a push is sent.
--
-- After editing:
--   npx supabase db query --linked -f supabase/notification_copy.sql
-- Or paste into the Supabase SQL editor and run.
--
-- Fresh projects get this seed from the catalog migration as well — keep both
-- in sync if you change copy before that migration is applied elsewhere.
-- =============================================================================

truncate table public.push_notification_copy;

insert into public.push_notification_copy (kind, title, body) values
  -- New temporary post
  ('post_temporary', 'Here and gone', '{author} dropped a 24h post in {ride}. Better hurry.'),
  ('post_temporary', 'Self-destructs in 24h', '{author} posted something in {ride} that won’t live to see tomorrow'),
  ('post_temporary', 'Blink and you’ll miss it', 'Catch {author} in {ride} before it vanishes'),

  -- New permanent post
  ('post_permanent', 'For the archives', '{author} posted in {ride} — this one sticks around'),
  ('post_permanent', 'Making history', '{author} just carved a permanent mark in {ride}'),
  ('post_permanent', 'This one’s forever', '{author} posted in {ride}. No takebacks.'),
  -- Comment on your post
  ('comment', 'Someone had thoughts', '{author} commented on your photo in {ride}'),
  ('comment', 'Fan mail', '{author} left a note on your post in {ride}'),
  ('comment', 'Reply guy spotted', 'Your photo in {ride} got a comment from {author}'),

  -- Mentioned in a comment
  ('mention', 'People are talking', '{author} mentioned you in {ride}'),
  ('mention', 'Tag, you’re it', '{author} tagged you in {ride}'),
  ('mention', 'Overheard', '{author}: {snippet}'),

  -- Join request (title is usually the requester name via {name})
  ('join_request', '{name}', 'wants in on {ride}'),

  -- Join decision (title is usually the owner name via {name})
  ('join_accepted', '{name}', 'let you into {ride}. Act natural.'),
  ('join_declined', '{name}', 'passed on your request to join {ride}'),

  -- Challenge opened
  ('challenge_opened', 'A challenge appears', '{challenge} · {ride}'),

  -- Everyone finished; reaction window open
  ('challenge_complete', 'That’s a wrap', 'Everyone finished {challenge} · {ride} — 1h left to react'),

  -- Winner declared
  ('challenge_winner', 'Winner, winner', '{winner} took {challenge} · {ride}');