import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { RideCard } from '@/components/ride-card';
import { Body, CenteredBusy, ScrollScreen, StatePanel } from '@/components/ui';
import { groupUserRides, useUserRides, type UserRide } from '@/features/rides';
import { colors, spacing } from '@/theme';

export default function YourRidesScreen() {
  const { user } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const groups = groupUserRides(rides.data ?? []);

  const openRide = (rideId: string) => {
    router.replace({ pathname: '/', params: { selectRideId: rideId } });
  };

  if (rides.isPending) {
    return (
      <ScrollScreen>
        <CenteredBusy message="Loading your Rides…" />
      </ScrollScreen>
    );
  }

  if (rides.isError) {
    return (
      <ScrollScreen>
        <StatePanel
          actionLabel="Try again"
          message={
            rides.error instanceof Error ? rides.error.message : 'Your Rides could not load.'
          }
          onAction={() => void rides.refetch()}
          title="Couldn’t load Rides"
        />
      </ScrollScreen>
    );
  }

  if (!rides.data?.length) {
    return (
      <ScrollScreen>
        <StatePanel
          actionLabel="Create a Ride"
          message="Start a private photo rhythm, or join with a friend’s code."
          onAction={() => router.push('/create-ride')}
          onSecondaryAction={() => router.push('/join-ride')}
          secondaryActionLabel="Join with code"
          title="No Rides yet"
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Body muted>Tap a Ride to open it in the Rides tab.</Body>
      {groups.active.length ? (
        <RideGroup label="Active" onSelect={openRide} rides={groups.active} userId={user?.id} />
      ) : null}
      {groups.upcoming.length ? (
        <RideGroup
          label="Upcoming"
          onSelect={openRide}
          rides={groups.upcoming}
          userId={user?.id}
        />
      ) : null}
      {groups.archived.length ? (
        <RideGroup
          label="Archived"
          onSelect={openRide}
          rides={groups.archived}
          userId={user?.id}
        />
      ) : null}
    </ScrollScreen>
  );
}

function RideGroup({
  label,
  rides,
  userId,
  onSelect,
}: {
  label: string;
  rides: readonly UserRide[];
  userId: string | null | undefined;
  onSelect: (rideId: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {rides.map((ride) => (
        <RideCard
          key={ride.id}
          onPress={() => onSelect(ride.id)}
          ride={ride}
          userId={userId}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  groupLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xxs,
    paddingTop: spacing.xs,
    textTransform: 'uppercase',
  },
});
