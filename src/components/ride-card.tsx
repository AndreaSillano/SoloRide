import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePostingStatus, type UserRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

import { GlassSurface } from './glass';

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

export function RideCard({
  ride,
  userId,
  selected = false,
  variant = 'row',
  onPress,
}: {
  ride: UserRide;
  userId: string | null | undefined;
  selected?: boolean;
  variant?: 'row' | 'tile';
  onPress?: () => void;
}) {
  const posting = usePostingStatus(ride.id, userId);
  const status = statusForRide(ride, posting);
  const isOwner = ride.current_user_role === 'creator';
  const label = `${ride.name}, ${status.label}${selected ? ', selected' : ''}`;

  if (variant === 'tile') {
    const body = (
      <View style={styles.tileInner}>
        {isOwner ? (
          <View style={styles.crown}>
            <Ionicons color={selected ? colors.white : colors.primary} name="sparkles" size={12} />
          </View>
        ) : null}
        <View
          style={[
            styles.tileStatus,
            selected && styles.tileStatusOnSelected,
            status.name === 'camera' && !selected && styles.statusChipDue,
            status.name === 'checkmark-circle' && !selected && styles.statusChipDone,
          ]}
        >
          <Ionicons color={selected ? colors.white : status.color} name={status.name} size={16} />
        </View>
        <Text
          ellipsizeMode="tail"
          numberOfLines={2}
          style={[styles.tileTitle, selected && styles.tileTitleSelected]}
        >
          {ride.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.tileMeta, selected && styles.tileMetaSelected]}
        >
          {status.label}
        </Text>
      </View>
    );

    const tile = selected ? (
      <LinearGradient
        colors={['#FF7A33', '#FF4D1A']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.tile, styles.tileSelected, shadows.glow]}
      >
        {body}
      </LinearGradient>
    ) : (
      <GlassSurface isInteractive={Boolean(onPress)} style={styles.tile}>
        {body}
      </GlassSurface>
    );

    if (!onPress) {
      return (
        <View accessibilityLabel={label} style={styles.tileWrap}>
          {tile}
        </View>
      );
    }

    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
      >
        {tile}
      </Pressable>
    );
  }

  const row = (
    <>
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.title}>
        {ride.name}
      </Text>
      {isOwner ? <Ionicons color={colors.primary} name="sparkles" size={14} /> : null}
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
    </>
  );

  if (!onPress) {
    return (
      <View
        accessibilityLabel={label}
        style={[styles.card, selected && styles.cardSelected]}
      >
        {row}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
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
  pressed: { opacity: 0.86 },
  tileWrap: {
    width: 112,
  },
  tile: {
    borderRadius: radius.md,
    height: 112,
    overflow: 'hidden',
    padding: spacing.sm,
    width: 112,
  },
  tileSelected: {
    borderWidth: 0,
  },
  tileInner: {
    flex: 1,
    gap: 2,
    justifyContent: 'flex-end',
  },
  crown: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tileStatus: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    marginBottom: 'auto',
    width: 30,
  },
  tileStatusOnSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tileTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tileTitleSelected: {
    color: colors.white,
  },
  tileMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  tileMetaSelected: {
    color: 'rgba(255,255,255,0.86)',
  },
});
