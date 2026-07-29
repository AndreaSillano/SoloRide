-- Replace emoji reactions with a -3..+3 score scale.
-- Zero is never stored: clearing a reaction deletes the row.

-- Existing emoji values cannot map cleanly onto the new scale.
delete from public.post_reactions;

alter table public.post_reactions
  drop constraint if exists post_reactions_emoji_length;

alter table public.post_reactions
  drop column emoji;

alter table public.post_reactions
  add column score smallint not null,
  add constraint post_reactions_score_range
    check (score between -3 and 3 and score <> 0);

revoke all on table public.post_reactions from anon, authenticated;
grant select, delete on table public.post_reactions to authenticated;
grant insert (id, post_id, user_id, score)
  on table public.post_reactions to authenticated;
grant update (post_id, user_id, score)
  on table public.post_reactions to authenticated;

notify pgrst, 'reload schema';
