import { addDays, format } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { RideForm } from '@/components/ride-form';
import {
  Body,
  Button,
  Card,
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

const today = new Date();
const INITIAL_VALUES: RideFormValues = {
  name: '',
  description: '',
  startDate: format(today, 'yyyy-MM-dd'),
  endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
  neverEnds: false,
  notificationTime: '09:00',
  weekdays: [today.getDay()],
  strictSchedule: true,
};

export default function CreateRideScreen() {
  const { user } = useCurrentUser();
  const createRide = useCreateRide(user?.id);
  const [values, setValues] = useState<RideFormValues>(INITIAL_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Ride | null>(null);

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
        <Heading>Your Ride is ready</Heading>
        <Body muted>Share this private code only with people you want in the Ride.</Body>
        <Card>
          <Body>{created.name}</Body>
          <Heading>{created.code}</Heading>
          <Button
            onPress={() =>
              void Share.share({
                message: `Join my SoloRide “${created.name}” with code ${created.code}`,
              })
            }
          >
            Share code
          </Button>
        </Card>
        <Button
          variant="secondary"
          onPress={() =>
            router.replace({ pathname: '/', params: { selectRideId: created.id } })
          }
        >
          Open Ride
        </Button>
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
