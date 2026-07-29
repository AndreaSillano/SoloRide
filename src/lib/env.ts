import { z } from 'zod';

function isClientSafeSupabaseKey(value: string) {
  if (value.startsWith('sb_secret_') || value.includes('service_role')) return false;
  const payload = value.split('.')[1];
  if (!payload) return value.startsWith('sb_publishable_');

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return decoded.role === 'anon';
  } catch {
    return false;
  }
}

const publicEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url().refine(
    (value) => value.startsWith('https://'),
    'Supabase URL must use HTTPS.',
  ),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20)
    .refine(
      isClientSafeSupabaseKey,
      'Use only a Supabase publishable or anon key in the app.',
    ),
});

const result = publicEnvSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

export const isSupabaseConfigured = result.success;
export const envConfigurationError = result.success
  ? null
  : `Add a client-safe Supabase publishable key to .env (${result.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ')}).`;

export const env = result.success
  ? result.data
  : {
      EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_not_configured',
    };
