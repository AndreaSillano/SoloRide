import { type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorScreen } from '@/components/error-screen';
import { colors, spacing } from '@/theme';

/** Root / route crash recovery UI — matches themed ErrorScreen. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.root}>
      <ErrorScreen
        actionLabel="Try again"
        message={error.message || 'Something tripped on the trail. Let’s dust off and retry.'}
        onAction={() => retry()}
        title="Well, that wasn’t in the plan"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
