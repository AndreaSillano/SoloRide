import { router } from 'expo-router';
import { useState } from 'react';

import { useCurrentUser } from '@/auth/auth-context';
import {
  Body,
  Button,
  Card,
  ErrorBanner,
  Field,
  Heading,
  ScrollScreen,
} from '@/components/ui';
import {
  requestNotificationRefresh,
  requestSoloRideNotificationPermission,
} from '@/features/notifications';
import {
  rideCodeSchema,
  useJoinRideByCode,
  usePreviewRideByCode,
  type RidePreviewStatus,
} from '@/features/rides';

const STATUS_MESSAGES: Record<Exclude<RidePreviewStatus, 'available'>, string> = {
  invalid: 'That code does not match a Ride. Check all 8 characters.',
  upcoming: 'This Ride is upcoming and cannot be joined yet.',
  expired: 'This Ride has ended and can no longer be joined.',
  archived: 'The creator archived this Ride.',
  duplicate: 'You are already a member of this Ride.',
};

export default function JoinRideScreen() {
  const { user } = useCurrentUser();
  const preview = usePreviewRideByCode();
  const join = useJoinRideByCode(user?.id);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkCode = async () => {
    const parsed = rideCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid Ride code.');
      return;
    }
    setError(null);
    try {
      await preview.mutateAsync(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Ride could not be checked.');
    }
  };

  const confirmJoin = async () => {
    setError(null);
    try {
      const ride = await join.mutateAsync(code);
      await requestSoloRideNotificationPermission();
      requestNotificationRefresh();
      router.replace({ pathname: '/', params: { selectRideId: ride.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Ride could not be joined.');
    }
  };

  const result = preview.data;

  return (
    <ScrollScreen>
      <Heading>Join a Ride</Heading>
      <Body muted>Your code only reveals basic Ride details until you confirm.</Body>
      <Field
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!preview.isPending && !join.isPending}
        label="8-character code"
        maxLength={8}
        onChangeText={(text) => {
          setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
          preview.reset();
        }}
        placeholder="AB12CD34"
        value={code}
      />
      <Button
        loading={preview.isPending}
        variant="secondary"
        onPress={() => void checkCode()}
      >
        Preview Ride
      </Button>
      <ErrorBanner message={error} />

      {result ? (
        result.status === 'available' && result.ride ? (
          <Card>
            <Heading>{result.ride.name}</Heading>
            {result.ride.description ? <Body>{result.ride.description}</Body> : null}
            <Body muted>
              {new Date(`${result.ride.start_date}T12:00:00`).toLocaleDateString()} –{' '}
              {new Date(`${result.ride.end_date}T12:00:00`).toLocaleDateString()}
            </Body>
            <Body muted>
              {result.ride.member_count} {result.ride.member_count === 1 ? 'member' : 'members'}
            </Body>
            <Button loading={join.isPending} onPress={() => void confirmJoin()}>
              Confirm join
            </Button>
          </Card>
        ) : (
          <Card>
            <Body>
              {STATUS_MESSAGES[result.status === 'available' ? 'invalid' : result.status]}
            </Body>
          </Card>
        )
      ) : null}
    </ScrollScreen>
  );
}
