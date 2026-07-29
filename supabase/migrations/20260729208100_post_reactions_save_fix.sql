-- PostgREST upsert rewrites conflict columns; allow updating them, and
-- refresh the schema cache so embeds resolve after the table was added.

grant update (post_id, user_id, emoji)
  on table public.post_reactions to authenticated;

notify pgrst, 'reload schema';
