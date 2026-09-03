import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CameraRide } from '@/features/rides';
import { colors, radius, spacing } from '@/theme';

import { AppBottomSheet } from './glass';
import { SheetCloseButton } from './sheet-close-button';

export function RidePickerModal({
  visible,
  rides,
  selectedIds,
  isTemporary,
  onSelect,
  onClose,
}: {
  visible: boolean;
  rides: CameraRide[];
  selectedIds: string[];
  isTemporary: boolean;
  onSelect: (rideId: string) => void;
  onClose: () => void;
}) {
  return (
    <AppBottomSheet onClose={onClose} visible={visible}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{isTemporary ? 'Choose a Ride' : 'Choose Rides'}</Text>
          <SheetCloseButton accessibilityLabel="Close ride picker" onPress={onClose} />
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
        >
          {rides.map((ride) => (
            <RideOption
              key={ride.id}
              onPress={() => onSelect(ride.id)}
              ride={ride}
              selected={selectedIds.includes(ride.id)}
            />
          ))}
        </ScrollView>
      </View>
    </AppBottomSheet>
  );
}

function RideOption({
  ride,
  selected,
  onPress,
}: {
  ride: CameraRide;
  selected: boolean;
  onPress: () => void;
}) {
  const statusLabel = ride.canPublishPermanent
    ? ride.isRequiredToday
      ? 'Photo due today'
      : 'Optional today'
    : '24h photos only';

  return (
    <Pressable
      accessibilityLabel={`${ride.name}, ${statusLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.rideOption,
        selected && styles.rideOptionSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rideName}>
        {ride.name}
      </Text>
      <View
        style={[
          styles.rideStatusChip,
          ride.canPublishPermanent ? styles.rideBadgeDue : styles.rideBadgeOptional,
        ]}
      >
        <Ionicons
          color={ride.canPublishPermanent ? colors.accent : colors.muted}
          name={ride.canPublishPermanent ? 'camera' : 'time-outline'}
          size={16}
        />
      </View>
      {selected ? <Ionicons color={colors.primary} name="checkmark" size={18} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, width: '100%' },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingRight: spacing.sm,
  },
  list: { gap: spacing.xxs, padding: spacing.md },
  rideOption: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rideOptionSelected: { backgroundColor: colors.primarySoft },
  rideName: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  rideStatusChip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  rideBadgeDue: { backgroundColor: colors.accentSoft },
  rideBadgeOptional: { backgroundColor: colors.surfaceMuted },
  pressed: { opacity: 0.75 },
});
