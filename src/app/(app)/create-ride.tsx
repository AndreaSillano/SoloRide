import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { addDays, format } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { RideForm } from '@/components/ride-form';
import {
  Body,
  Button,
  ErrorBanner,
  Heading,
  ScrollScreen,
} from '@/components/ui';
import {
  requestNotificationRefresh,
  requestSoloRideNotificationPermission,
} from '@/features/notifications';
import {
  MAX_LIVE_RIDES_PER_USER,
  MAX_RIDE_MEMBERS,
  rideFormSchema,
  useCreateRide,
  type Ride,
  type RideFormValues,
} from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

const today = new Date();
const INITIAL_VALUES: RideFormValues = {
  name: '',
  description: '',
  startDate: format(today, 'yyyy-MM-dd'),
  endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
  neverEnds: false,
  notificationTime: '09:00',
  scheduleKind: 'weekly',
  weekdays: [today.getDay()],
  monthDay: today.getDate(),
  weekdayOrdinal: 1,
  strictSchedule: true,
};

function goHomeWithRide(rideId: string) {
  router.dismissTo({
    pathname: '/',
    params: {
      selectRideId: rideId,
      notificationOpenId: String(Date.now()),
    },
  });
}

export default function CreateRideScreen() {
  const navigation = useNavigation();
  const { user } = useCurrentUser();
  const createRide = useCreateRide(user?.id);
  const [values, setValues] = useState<RideFormValues>(INITIAL_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Ride | null>(null);
  const allowLeaveRef = useRef(false);

  const openCreatedRide = (rideId: string) => {
    allowLeaveRef.current = true;
    goHomeWithRide(rideId);
  };

  // After create, back / swipe-dismiss should land on Home with the new Ride selected.
  useEffect(() => {
    if (!created) return;
    const sub = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      openCreatedRide(created.id);
    });
    return sub;
  }, [created, navigation]);

  const submit = async () => {
    const parsed = rideFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the Ride details.');
      return;
    }
    setError(null);
    try {
      setCreated(await createRide.mutateAsync(parsed.data));
      haptics.success();
      await requestSoloRideNotificationPermission();
      requestNotificationRefresh();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'The Ride could not be created.');
    }
  };

  if (created) {
    return (
      <ScrollScreen>
        <View style={styles.successBlock}>
          <View style={styles.successIcon}>
            <Ionicons color={colors.accent} name="checkmark-circle" size={56} />
          </View>
          <Text style={styles.successTitle}>Your Ride is ready</Text>
          <Text style={styles.rideName} numberOfLines={2}>
            {created.name}
          </Text>
          <Text style={styles.codeLabel}>Invite code</Text>
          <Text style={styles.code}>{created.code}</Text>
          <Text style={styles.successCopy}>
            Share this private code only with people you want in the Ride.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            onPress={() =>
              void Share.share({
                message: `Join my Rhodeo “${created.name}” with code ${created.code}`,
              })
            }
          >
            Share code
          </Button>
          <Button variant="secondary" onPress={() => openCreatedRide(created.id)}>
            Open Ride
          </Button>
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Heading>Create a Ride</Heading>
      <Body muted>
        Up to {MAX_RIDE_MEMBERS} riders per Ride. You can be in {MAX_LIVE_RIDES_PER_USER} active
        Rides at a time.
      </Body>
      <RideForm disabled={createRide.isPending} onChange={setValues} value={values} />
      <ErrorBanner message={error} />
      <Button loading={createRide.isPending} onPress={() => void submit()}>
        Create Ride
      </Button>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  successBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.xl,
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 88,
  },
  successTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  rideName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  codeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  code: {
    color: colors.accent,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  successCopy: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  actions: { gap: spacing.sm },
});
