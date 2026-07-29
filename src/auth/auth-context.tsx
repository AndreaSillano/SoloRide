import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { usernameSchema, usernameToInternalEmail } from '@/auth/username';
import { unregisterExpoPushToken } from '@/features/notifications/push';
import { supabase } from '@/lib/supabase';
import { envConfigurationError, isSupabaseConfigured } from '@/lib/env';

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', userId)
      .maybeSingle<Profile>();

    if (error) {
      setProfile(null);
      setProfileError('We could not load your profile right now.');
      return;
    }

    setProfile(data);
    setProfileError(data ? null : 'Your profile is still being prepared.');
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setProfileError(envConfigurationError);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (username: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error(envConfigurationError ?? 'Supabase is not configured.');
    const normalized = usernameSchema.parse(username);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToInternalEmail(normalized),
      password,
    });
    if (error) throw error;
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error(envConfigurationError ?? 'Supabase is not configured.');
    const normalized = usernameSchema.parse(username);
    const { data, error } = await supabase.auth.signUp({
      email: usernameToInternalEmail(normalized),
      password,
      options: {
        data: { username: normalized },
      },
    });
    if (error) throw error;

    if (!data.session) {
      // signUp succeeded but no session was returned, which means the project
      // has "Confirm email" enabled. Since usernames map to a fake
      // @soloride.internal address, that confirmation email can never be
      // delivered, so sign-in the account explicitly instead of waiting on it.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToInternalEmail(normalized),
        password,
      });
      if (signInError) {
        throw new Error(
          'Your account was created but could not be confirmed automatically. ' +
            'Turn off "Confirm email" for the Email provider in the Supabase dashboard ' +
            '(Authentication → Sign In / Providers → Email) and try logging in again.',
        );
      }
    }
  }, []);

  const logout = useCallback(async () => {
    await unregisterExpoPushToken().catch(() => undefined);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  }, [loadProfile, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      isLoading,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [
      session,
      profile,
      profileError,
      isLoading,
      login,
      register,
      logout,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}

export function useCurrentUser() {
  const { user, profile, profileError, isLoading, refreshProfile } = useAuth();
  return { user, profile, profileError, isLoading, refreshProfile };
}
