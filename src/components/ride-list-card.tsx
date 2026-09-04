import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '@/components/glass';
import type { RideMemberSummary, UserRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

export function RideListCard({
  ride,
  summary,
  onPress,
}: {
  ride: UserRide;
  summary?: RideMemberSummary | null;
  onPress?: () => void;
}) {
  const people = summary?.count ?? null;
  const peopleLabel =
    people == null
      ? '…'
      : `${people} ${people === 1 ? 'person' : 'people'}`;
  const description = ride.description?.trim() || 'Private photo Ride';
  const label = `${ride.name}, ${peopleLabel}`;

  const body = (
    <GlassSurface isInteractive={Boolean(onPress)} style={styles.card} tintColor={colors.white}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.title}>
            {ride.name}
          </Text>
          <Text ellipsizeMode="tail" numberOfLines={2} style={styles.subtitle}>
            {description}
          </Text>
        </View>
        <View style={styles.people}>
          <Text style={styles.peopleText}>{peopleLabel}</Text>
          <Ionicons color={colors.muted} name="chevron-forward" size={13} />
        </View>
      </View>
    </GlassSurface>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={label} style={styles.wrap}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    ...shadows.card,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  people: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    paddingTop: 4,
  },
  peopleText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: { opacity: 0.9 },
});
