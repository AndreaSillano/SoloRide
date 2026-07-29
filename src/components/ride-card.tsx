import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePostingStatus, type UserRide } from '@/features/rides';
import { colors, radius, spacing } from '@/theme';

type StatusIcon = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
};

function statusForRide(
  ride: UserRide,
  posting: ReturnType<typeof usePostingStatus>,
): StatusIcon {
  if (ride.is_archived) {
    return { name: 'archive-outline', color: colors.muted, label: 'Archived' };
  }
  if (!posting.scheduledToday) {
    return { name: 'calendar-outline', color: colors.muted, label: 'Not scheduled today' };
  }
  if (posting.hasPosted) {
    return { name: 'checkmark-circle', color: colors.primary, label: 'Posted today' };
  }
  if (!posting.isRequiredToday) {
    return { name: 'camera-outline', color: colors.muted, label: 'Optional today' };
  }
  return { name: 'camera', color: colors.accent, label: 'Photo due today' };
}

/** A compact row for the Ride switcher: name + today’s posting status icon. */
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
  const status = statusForRide(ride, posting);

  return (
    <Pressable
      accessibilityLabel={`${ride.name}, ${status.label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.title}>
        {ride.name}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.statusChip,
          status.name === 'camera' && styles.statusChipDue,
          status.name === 'checkmark-circle' && styles.statusChipDone,
        ]}
      >
        <Ionicons color={status.color} name={status.name} size={18} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  statusChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  statusChipDue: { backgroundColor: colors.accentSoft },
  statusChipDone: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.72 },
});
