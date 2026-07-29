import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { NotificationLifecycle } from '@/features/notifications/NotificationLifecycle';

/** Drops cached rides/feed/errors when the signed-in account changes so a
 * failed fetch during logout can't stick around after the next login. */
function ClearQueryCacheOnAuthChange() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const nextId = user?.id ?? null;
    if (previousUserId.current === undefined) {
      previousUserId.current = nextId;
      return;
    }
    if (previousUserId.current === nextId) return;
    previousUserId.current = nextId;
    queryClient.clear();
  }, [user?.id, queryClient]);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ClearQueryCacheOnAuthChange />
          <NotificationLifecycle />
          {children}
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
