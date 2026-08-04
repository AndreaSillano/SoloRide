import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import {
  Body,
  Button,
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
  MAX_LIVE_RIDES_PER_USER,
  rideCodeSchema,
  useRequestJoinRideByCode,
} from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

export default function JoinRideScreen() {
  const { user } = useCurrentUser();
  const requestJoin = useRequestJoinRideByCode(user?.id);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestedRideName, setRequestedRideName] = useState<string | null>(null);

  const submitRequest = async () => {
    const parsed = rideCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid Ride code.');
      return;
    }
    setError(null);
    try {
      const ride = await requestJoin.mutateAsync(parsed.data);
      haptics.success();
      await requestSoloRideNotificationPermission();
      requestNotificationRefresh();
      setRequestedRideName(ride.name);
    } catch (cause) {
      haptics.error();
      setError(
        cause instanceof Error ? cause.message : 'The join request could not be sent.',
      );
    }
  };

  if (requestedRideName) {
    return (
      <ScrollScreen>
        <View style={styles.successBlock}>
          <View style={styles.successIcon}>
            <Ionicons color={colors.accent} name="checkmark-circle" size={56} />
          </View>
          <Text style={styles.successTitle}>Request sent</Text>
          <Text style={styles.rideName} numberOfLines={2}>
            {requestedRideName}
          </Text>
          <Text style={styles.successCopy}>
            The owner will review your request. You’ll get a notification when they accept or
            decline.
          </Text>
        </View>
        <Button onPress={() => router.dismissTo('/')}>Done</Button>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Heading>Join a Ride</Heading>
      <Body muted>
        Enter a private code to request access. The Ride owner must accept before you can see
        posts. You can be in {MAX_LIVE_RIDES_PER_USER} active Rides at a time.
      </Body>
      <Field
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!requestJoin.isPending}
        label="8-character code"
        maxLength={8}
        onChangeText={(text) => {
          setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
          setError(null);
        }}
        placeholder="AB12CD34"
        value={code}
      />
      <Button
        loading={requestJoin.isPending}
        variant="accent"
        onPress={() => void submitRequest()}
      >
        Request to join
      </Button>
      <ErrorBanner message={error} />
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
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  successCopy: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
});
