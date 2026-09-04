import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChallengeHatIcon } from '@/components/challenge-hat-icon';
import {
  formatChallengeRemaining,
  isChallengeVisible,
  type RideChallenge,
} from '@/features/challenges';
import { colors, radius, spacing } from '@/theme';

export function ChallengeListRow({
  challenge,
  onPress,
  last = false,
}: {
  challenge: RideChallenge;
  onPress: () => void;
  /** Omit the bottom hairline when this is the last row in a grouped list. */
  last?: boolean;
}) {
  const title = challenge.challenge?.title ?? 'Challenge';
  const active = isChallengeVisible(challenge.ends_at);
  const timeLabel = formatChallengeRemaining(challenge.ends_at);
  const completions = challenge.completers.length;
  const meta = [
    active ? timeLabel : 'Ended',
    `${completions} ${completions === 1 ? 'entry' : 'entries'}`,
    challenge.source === 'manual' ? 'Manual' : 'Auto',
  ].join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconWrap}>
        <ChallengeHatIcon color={colors.white} size={15} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {active ? (
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>Live</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          {meta}
        </Text>
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  livePill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  livePillText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: { opacity: 0.72 },
});
