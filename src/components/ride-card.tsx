import { Pressable, StyleSheet, Text } from 'react-native';

import { usePostingStatus, type UserRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

/** A compact row for the Ride switcher: just the name and today's posting status. */
export function RideCard({
  ride,
  userId,
  onPress,
}: {
  ride: UserRide;
  userId: string | null | undefined;
  onPress: () => void;
}) {
  const posting = usePostingStatus(ride.id, userId);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={styles.title}>
        {ride.name}
      </Text>
      {ride.is_archived ? (
        <Text style={styles.mutedStatus}>Archived</Text>
      ) : posting.scheduledToday ? (
        <Text
          style={
            posting.hasPosted
              ? styles.done
              : !posting.isRequiredToday
                ? styles.mutedStatus
                : styles.due
          }
        >
          {posting.hasPosted
            ? 'Posted today ✓'
            : !posting.isRequiredToday
              ? 'Optional today'
              : 'Photo due today'}
        </Text>
      ) : (
        <Text style={styles.mutedStatus}>Not scheduled today</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(222, 217, 205, 0.7)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  title: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  due: { color: colors.accentPressed, fontSize: 13, fontWeight: '800' },
  done: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  mutedStatus: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});
