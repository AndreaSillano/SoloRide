import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePostingStatus, type UserRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

import { GlassSurface } from './glass';
import { rideStatusLabel } from './ride-card';

export function RideSelector({
  rides,
  selectedRide,
  selectedRideId,
  userId,
  open,
  onOpenChange,
  onSelect,
}: {
  rides: readonly UserRide[];
  selectedRide: UserRide | null;
  selectedRideId: string | null;
  userId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (rideId: string) => void;
}) {
  const selectedStatus = useSelectedRideStatus(selectedRide, userId);
  const otherRides = useMemo(
    () => rides.filter((ride) => ride.id !== selectedRideId),
    [rides, selectedRideId],
  );
  const canSwitch = otherRides.length > 0;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={
          selectedRide
            ? canSwitch
              ? open
                ? `Hide other rides, currently in ${selectedRide.name}`
                : `Switch ride, currently in ${selectedRide.name}, ${selectedStatus}`
              : `Currently in ${selectedRide.name}, ${selectedStatus}`
            : canSwitch
              ? open
                ? 'Hide rides'
                : 'Show rides'
              : 'Your rides'
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !canSwitch }}
        disabled={!canSwitch}
        onPress={() => onOpenChange(!open)}
        style={({ pressed }) => [pressed && canSwitch && styles.pressed]}
      >
        <GlassSurface isInteractive={canSwitch} style={styles.trigger}>
          <View style={styles.triggerBody}>
            <Text numberOfLines={1} style={styles.triggerTitle}>
              {selectedRide?.name ?? 'Your rides'}
            </Text>
            {selectedRide ? (
              <Text numberOfLines={1} style={styles.triggerMeta}>
                {selectedStatus}
                {selectedRide.current_user_role === 'creator' ? ' · Owner' : ''}
              </Text>
            ) : null}
          </View>
          {canSwitch ? (
            <Ionicons
              color={colors.muted}
              name={open ? 'chevron-up' : 'chevron-down'}
              size={16}
            />
          ) : null}
        </GlassSurface>
      </Pressable>

      {open && canSwitch ? (
        <GlassSurface style={styles.menu}>
          <ScrollView
            bounces={otherRides.length > 5}
            contentContainerStyle={styles.menuContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.menuScroll}
          >
            {otherRides.map((ride, index) => (
              <View key={ride.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <RideOption
                  onPress={() => {
                    onSelect(ride.id);
                    onOpenChange(false);
                  }}
                  ride={ride}
                  userId={userId}
                />
              </View>
            ))}
          </ScrollView>
        </GlassSurface>
      ) : null}
    </View>
  );
}

function useSelectedRideStatus(
  ride: UserRide | null,
  userId: string | null | undefined,
) {
  const posting = usePostingStatus(ride?.id, userId);
  if (!ride) return '';
  return rideStatusLabel(ride, posting);
}

function RideOption({
  ride,
  userId,
  onPress,
}: {
  ride: UserRide;
  userId: string | null | undefined;
  onPress: () => void;
}) {
  const posting = usePostingStatus(ride.id, userId);
  const status = rideStatusLabel(ride, posting);
  const isOwner = ride.current_user_role === 'creator';

  return (
    <Pressable
      accessibilityLabel={`${ride.name}, ${status}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionBody}>
        <View style={styles.optionTitleRow}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.optionTitle}>
            {ride.name}
          </Text>
          {isOwner ? <Ionicons color={colors.primary} name="sparkles" size={14} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.optionMeta}>
          {status}
        </Text>
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 3,
  },
  trigger: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  triggerBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  triggerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  triggerMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  menu: {
    borderRadius: radius.md,
    left: 0,
    marginTop: spacing.xxs,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 4,
    ...shadows.floating,
  },
  menuScroll: {
    maxHeight: 280,
  },
  menuContent: {
    paddingVertical: spacing.xxs,
  },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  optionTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  optionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  pressed: { opacity: 0.72 },
});
