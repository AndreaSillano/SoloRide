import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { AppBottomSheet } from '@/components/glass';
import { SheetCloseButton } from '@/components/sheet-close-button';
import { groupUserRides, useUserRides, type UserRide } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

export type ProposeOffer = {
  venue: string;
  offer: string;
  detail: string;
  area: string;
  when: string;
  image: ImageSourcePropType;
};

export function ProposeToRideSheet({
  visible,
  offer,
  onClose,
}: {
  visible: boolean;
  offer: ProposeOffer | null;
  onClose: () => void;
}) {
  const { user } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const insets = useSafeAreaInsets();
  const rideOptions = useMemo(() => {
    const groups = groupUserRides(rides.data ?? []);
    return [...groups.active, ...groups.upcoming];
  }, [rides.data]);

  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible || !offer) return;
    setMessage(`Anyone up for ${offer.offer}?`);
  }, [visible, offer]);

  useEffect(() => {
    if (!visible) return;
    setSelectedRideId((current) => {
      if (current && rideOptions.some((ride) => ride.id === current)) return current;
      return rideOptions[0]?.id ?? null;
    });
  }, [visible, rideOptions]);

  const selectedRide =
    rideOptions.find((ride) => ride.id === selectedRideId) ?? null;

  const send = () => {
    if (!selectedRide || !offer) return;
    haptics.success();
    onClose();
  };

  return (
    <AppBottomSheet onClose={onClose} visible={visible}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Propose to Ride</Text>
            <Text style={styles.subtitle}>Share this offer with your people</Text>
          </View>
          <SheetCloseButton accessibilityLabel="Close propose sheet" onPress={onClose} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: spacing.xl + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
        >
          {offer ? (
            <View style={styles.offerCard}>
              <View style={styles.offerImageWrap}>
                <Image
                  resizeMode="cover"
                  source={offer.image}
                  style={styles.offerImage}
                />
              </View>
              <View style={styles.offerCopy}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.offerVenue}>
                  {offer.offer}
                </Text>
                <Text ellipsizeMode="tail" numberOfLines={1} style={styles.offerDeal}>
                  {offer.detail}
                </Text>
                <Text style={styles.offerMeta}>
                  {offer.when} · {offer.area}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.label}>Share with a Ride</Text>
            {rideOptions.length ? (
              <View style={styles.rideList}>
                {rideOptions.map((ride) => (
                  <RideChoice
                    key={ride.id}
                    onPress={() => {
                      haptics.selection();
                      setSelectedRideId(ride.id);
                    }}
                    ride={ride}
                    selected={ride.id === selectedRideId}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyRides}>
                <Ionicons color={colors.muted} name="people-outline" size={22} />
                <Text style={styles.emptyRidesText}>
                  Create or join a Ride first, then you can propose here.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              multiline
              onChangeText={setMessage}
              placeholder="Add a note for your Ride…"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              style={styles.messageInput}
              textAlignVertical="top"
              value={message}
            />
          </View>

          <Pressable
            accessibilityLabel="Send proposal"
            accessibilityRole="button"
            disabled={!selectedRide || !offer}
            onPress={send}
            style={({ pressed }) => [
              styles.sendButton,
              (!selectedRide || !offer) && styles.sendDisabled,
              pressed && selectedRide && styles.sendPressed,
            ]}
          >
            <Ionicons color={colors.white} name="paper-plane" size={16} />
            <Text style={styles.sendText}>
              {selectedRide ? `Send to ${selectedRide.name}` : 'Send to Ride'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </AppBottomSheet>
  );
}

function RideChoice({
  ride,
  selected,
  onPress,
}: {
  ride: UserRide;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={ride.name}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rideOption,
        selected && styles.rideOptionSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.rideDot, selected && styles.rideDotSelected]}>
        {selected ? <Ionicons color={colors.white} name="checkmark" size={14} /> : null}
      </View>
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rideName}>
        {ride.name}
      </Text>
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
  headerCopy: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  offerCard: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadows.card,
  },
  offerImageWrap: {
    backgroundColor: colors.surfaceMuted,
    width: 88,
  },
  offerImage: {
    height: '100%',
    minHeight: 88,
    width: '100%',
  },
  offerCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offerVenue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  offerDeal: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  offerMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  block: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  rideList: {
    gap: spacing.xs,
  },
  rideOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rideOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  rideDot: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  rideDotSelected: {
    backgroundColor: colors.primary,
  },
  rideName: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyRides: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyRidesText: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  messageInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    minHeight: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    ...shadows.glow,
  },
  sendPressed: {
    backgroundColor: colors.primaryPressed,
  },
  sendDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: { opacity: 0.75 },
});
