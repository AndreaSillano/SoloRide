import { z } from 'zod';

export const INTERNAL_EMAIL_DOMAIN = 'soloride.internal';

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, 'Username must be at least 3 characters.')
      .max(24, 'Username must be 24 characters or fewer.')
      .regex(
        /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/,
        'Use lowercase letters, numbers, and underscores.',
      ),
  );

export function usernameToInternalEmail(username: string) {
  return `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;
}
