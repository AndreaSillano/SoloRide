import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useActiveRideChallenges } from '@/features/challenges';
import { usePostingStatus, useRidesDueToday, type UserRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

import { ChallengeHatIcon } from './challenge-hat-icon';
import { GlassSurface } from './glass';
import { isRidePhotoDue, rideStatusLabel } from './ride-card';

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
  const selectedPosting = usePostingStatus(selectedRide?.id, userId);
  const selectedStatus = selectedRide ? rideStatusLabel(selectedRide, selectedPosting) : '';
  const selectedDue = selectedRide ? isRidePhotoDue(selectedRide, selectedPosting) : false;
  const dueToday = useRidesDueToday(userId);
  const dueCount = useMemo(
    () => (dueToday.data?.postableRides ?? []).filter((ride) => ride.isRequiredToday).length,
    [dueToday.data?.postableRides],
  );
  const rideIds = useMemo(() => rides.map((ride) => ride.id), [rides]);
  const incompleteChallenges = useActiveRideChallenges(rideIds);
  const selectedChallengePending = Boolean(
    selectedRideId && incompleteChallenges.byRideId.has(selectedRideId),
  );
  const hasAnyChallengePending = incompleteChallenges.eligible.length > 0;
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
                : `Switch ride, currently in ${selectedRide.name}, ${selectedStatus}${
                    dueCount > 0
                      ? `, ${dueCount} ride${dueCount === 1 ? '' : 's'} need a photo`
                      : ''
                  }${selectedChallengePending ? ', challenge waiting' : ''}`
              : `Currently in ${selectedRide.name}, ${selectedStatus}${
                  selectedChallengePending ? ', challenge waiting' : ''
                }`
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
        <View style={styles.triggerWrap}>
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
            {selectedChallengePending ? (
              <View style={styles.challengeChip}>
                <ChallengeHatIcon color={colors.primary} size={13} />
              </View>
            ) : null}
            {selectedDue ? (
              <View style={styles.dueChip}>
                <Ionicons color={colors.accent} name="alert-circle" size={16} />
              </View>
            ) : null}
            {canSwitch ? (
              <Ionicons
                color={colors.muted}
                name={open ? 'chevron-up' : 'chevron-down'}
                size={16}
              />
            ) : null}
          </GlassSurface>
          {dueCount > 0 ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.cornerBadge, styles.dueBadge]}
            >
              <Text style={styles.dueBadgeText}>{dueCount > 9 ? '9+' : dueCount}</Text>
            </View>
          ) : null}
          {hasAnyChallengePending ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.cornerBadge,
                styles.challengeBadge,
                dueCount > 0 && styles.challengeBadgeWithDue,
              ]}
            >
              <ChallengeHatIcon color={colors.white} size={10} />
            </View>
          ) : null}
        </View>
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
                  challengePending={incompleteChallenges.byRideId.has(ride.id)}
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

function RideOption({
  ride,
  userId,
  challengePending,
  onPress,
}: {
  ride: UserRide;
  userId: string | null | undefined;
  challengePending: boolean;
  onPress: () => void;
}) {
  const posting = usePostingStatus(ride.id, userId);
  const status = rideStatusLabel(ride, posting);
  const photoDue = isRidePhotoDue(ride, posting);

  return (
    <Pressable
      accessibilityLabel={`${ride.name}, ${status}${
        challengePending ? ', challenge waiting' : ''
      }`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionBody}>
        <View style={styles.optionTitleRow}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.optionTitle}>
            {ride.name}
          </Text>
          {ride.current_user_role === 'creator' ? (
            <Text style={styles.ownerTag}>Owner</Text>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.optionMeta}>
          {status}
        </Text>
      </View>
      {challengePending ? (
        <View style={styles.challengeChip}>
          <ChallengeHatIcon color={colors.primary} size={13} />
        </View>
      ) : null}
      {photoDue ? (
        <View style={styles.dueChip}>
          <Ionicons color={colors.accent} name="alert-circle" size={16} />
        </View>
      ) : null}
      <Ionicons color={colors.muted} name="chevron-forward" size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 3,
  },
  triggerWrap: {
    position: 'relative',
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
  dueChip: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  challengeChip: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  cornerBadge: {
    alignItems: 'center',
    borderColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    position: 'absolute',
  },
  dueBadge: {
    backgroundColor: colors.primary,
    minHeight: 20,
    minWidth: 20,
    paddingHorizontal: 5,
    right: -4,
    top: -6,
  },
  dueBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  challengeBadge: {
    backgroundColor: colors.primary,
    height: 22,
    right: -4,
    top: -6,
    width: 22,
  },
  challengeBadgeWithDue: {
    right: 18,
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
  ownerTag: {
    color: colors.muted,
    fontSize: 11,
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
