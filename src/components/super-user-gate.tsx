import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { colors } from '@/theme';

/** Renders children only for staff accounts; others go home. */
export function SuperUserGate({ children }: PropsWithChildren) {
  const { profile, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile?.is_super_user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return children;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
