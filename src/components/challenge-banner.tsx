import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChallengeHatIcon } from '@/components/challenge-hat-icon';
import { Avatar } from '@/components/ui';
import {
  formatChallengeRemaining,
  type RideChallenge,
} from '@/features/challenges';
import { colors, radius, shadows, spacing } from '@/theme';

const MAX_AVATARS = 4;

export function ChallengeBanner({
  challenge,
  onPress,
}: {
  challenge: RideChallenge;
  onPress: () => void;
}) {
  const title = challenge.challenge?.title ?? 'Challenge';
  const description = challenge.challenge?.description?.trim() ?? '';
  const completers = challenge.completers.slice(0, MAX_AVATARS);
  const extra = Math.max(0, challenge.completers.length - completers.length);
  const timeLabel = formatChallengeRemaining(challenge.ends_at);
  const ended = timeLabel === 'Ended';

  return (
    <Pressable
      accessibilityLabel={`Challenge: ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={ended ? [colors.surfaceMuted, colors.primarySoft] : [colors.primary, '#FF8A45', '#F6B35A']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.banner, ended && styles.bannerEnded]}
      >
        <View style={[styles.sheen, ended && styles.sheenEnded]} />
        <View style={styles.row}>
          <View style={[styles.trophyWrap, ended && styles.trophyWrapEnded]}>
            <ChallengeHatIcon color={ended ? colors.accent : colors.white} size={20} />
          </View>

          <View style={styles.copy}>
            <Text numberOfLines={2} style={[styles.title, ended && styles.titleEnded]}>
              {title}
            </Text>
            {description ? (
              <Text numberOfLines={1} style={[styles.description, ended && styles.descriptionEnded]}>
                {description}
              </Text>
            ) : null}
          </View>

          <View style={styles.trailing}>
            <View style={styles.avatars}>
              {completers.length === 0 ? (
                <Text style={[styles.emptyCompleters, ended && styles.emptyCompletersEnded]}>
                  Be first
                </Text>
              ) : (
                completers.map((profile, index) => (
                  <View
                    key={profile.id}
                    style={[
                      styles.avatarWrap,
                      ended && styles.avatarWrapEnded,
                      {
                        marginLeft: index === 0 ? 0 : -10,
                        zIndex: completers.length - index,
                      },
                    ]}
                  >
                    <Avatar profile={profile} size={28} />
                  </View>
                ))
              )}
              {extra > 0 ? (
                <Text style={[styles.extra, ended && styles.extraEnded]}>+{extra}</Text>
              ) : null}
              <Ionicons
                color={ended ? colors.muted : 'rgba(255,255,255,0.92)'}
                name="chevron-forward"
                size={16}
              />
            </View>
            <View style={styles.timeRow}>
              <Ionicons
                color={ended ? colors.muted : 'rgba(255,255,255,0.9)'}
                name="time-outline"
                size={13}
              />
              <Text style={[styles.time, ended && styles.timeEnded]}>{timeLabel}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.lg,
    ...shadows.challenge,
  },
  banner: {
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  bannerEnded: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sheenEnded: {
    backgroundColor: 'transparent',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  trophyWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  trophyWrapEnded: {
    backgroundColor: colors.accentSoft,
    borderColor: 'transparent',
    borderWidth: 0,
  },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  titleEnded: {
    color: colors.text,
  },
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  descriptionEnded: {
    color: colors.textSoft,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 6,
  },
  avatars: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  avatarWrap: {
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  avatarWrapEnded: {
    borderColor: colors.surface,
  },
  emptyCompleters: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCompletersEnded: {
    color: colors.muted,
  },
  extra: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 2,
  },
  extraEnded: {
    color: colors.textSoft,
  },
  timeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  time: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '700',
  },
  timeEnded: {
    color: colors.muted,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
});
