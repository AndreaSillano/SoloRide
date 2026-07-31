/** Instagram-style @mention helpers for comment text. */

const USERNAME_BODY = '[a-z0-9](?:[a-z0-9_]*[a-z0-9])?';

/** Active @query at the cursor — loose so typing mid-username still works. */
const ACTIVE_MENTION_RE = /(?:^|[^a-z0-9_])@([a-z0-9_]{0,24})$/i;

/** Completed @username tokens in free text. */
const MENTION_TOKEN_RE = new RegExp(`@(${USERNAME_BODY})`, 'gi');

export type ActiveMention = {
  /** Index of the `@` in the full string. */
  start: number;
  /** Text after `@` (may be empty right after typing `@`). */
  query: string;
};

export type CommentTextSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; username: string };

export function getActiveMention(text: string, cursor: number): ActiveMention | null {
  const before = text.slice(0, Math.max(0, Math.min(cursor, text.length)));
  const match = before.match(ACTIVE_MENTION_RE);
  if (!match) return null;

  const query = match[1] ?? '';
  const start = before.length - query.length - 1;
  if (start < 0 || before[start] !== '@') return null;
  return { start, query: query.toLowerCase() };
}

export function insertMentionAt(
  text: string,
  cursor: number,
  mentionStart: number,
  username: string,
): { text: string; cursor: number } {
  const handle = username.replace(/^@/, '').toLowerCase();
  const insertion = `@${handle} `;
  const next = `${text.slice(0, mentionStart)}${insertion}${text.slice(cursor)}`;
  return { text: next, cursor: mentionStart + insertion.length };
}

/** Unique usernames referenced with @ in the comment body. */
export function extractMentionUsernames(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const username = match[1]?.toLowerCase();
    if (username) found.add(username);
  }
  return [...found];
}

/** Split comment text so known @usernames can be styled like Instagram. */
export function splitCommentMentions(
  text: string,
  knownUsernames: ReadonlySet<string>,
): CommentTextSegment[] {
  if (!text) return [{ type: 'text', value: '' }];

  const segments: CommentTextSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(`@(${USERNAME_BODY})`, 'gi');

  for (const match of text.matchAll(re)) {
    const username = match[1]?.toLowerCase() ?? '';
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    if (knownUsernames.has(username)) {
      segments.push({ type: 'mention', value: match[0], username });
    } else {
      segments.push({ type: 'text', value: match[0] });
    }
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', value: text }];
}
