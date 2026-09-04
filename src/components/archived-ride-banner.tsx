import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export function ArchivedRideBanner() {
  return (
    <View accessibilityRole="text" style={styles.banner}>
      <Text style={styles.title}>Ride archived</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
