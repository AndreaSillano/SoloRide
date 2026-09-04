import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { ErrorScreen } from '@/components/error-screen';
import { RideListCard } from '@/components/ride-list-card';
import { Body, CenteredBusy, ScrollScreen, StatePanel } from '@/components/ui';
import {
  groupUserRides,
  useMyPendingJoinRequests,
  useRideMemberSummaries,
  useUserRides,
  type MyPendingJoinRequest,
  type UserRide,
} from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

function goHomeWithRide(rideId: string) {
  router.dismissTo({
    pathname: '/',
    params: {
      selectRideId: rideId,
      notificationOpenId: String(Date.now()),
    },
  });
}

export default function YourRidesScreen() {
  const { user } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const pending = useMyPendingJoinRequests(user?.id);
  const rideIds = useMemo(
    () => (rides.data ?? []).map((ride) => ride.id),
    [rides.data],
  );
  const summaries = useRideMemberSummaries(user?.id, rideIds);
  const groups = groupUserRides(rides.data ?? []);
  const pendingRequests = pending.data ?? [];

  if (rides.isPending || pending.isPending) {
    return (
      <ScrollScreen>
        <CenteredBusy message="Loading your Rides…" />
      </ScrollScreen>
    );
  }

  if (rides.isError) {
    return (
      <ScrollScreen>
        <ErrorScreen
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

  const hasRides = Boolean(rides.data?.length);
  const hasPending = pendingRequests.length > 0;

  if (!hasRides && !hasPending) {
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
    <ScrollScreen contentStyle={styles.screen}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Your Rides</Text>
        <Text style={styles.introSubtitle}>Private spaces with your people</Text>
      </View>

      {hasPending ? (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>
            Waiting for approval · {pendingRequests.length}
          </Text>
          {pending.isError ? (
            <Body muted>Pending requests could not load.</Body>
          ) : (
            pendingRequests.map((request) => (
              <PendingJoinCard key={request.id} request={request} />
            ))
          )}
        </View>
      ) : null}

      {groups.active.length ? (
        <RideGroup
          label="Active"
          rides={groups.active}
          summaries={summaries.data}
        />
      ) : null}
      {groups.upcoming.length ? (
        <RideGroup
          label="Upcoming"
          rides={groups.upcoming}
          summaries={summaries.data}
        />
      ) : null}
      {groups.archived.length ? (
        <RideGroup
          label="Archived"
          rides={groups.archived}
          summaries={summaries.data}
        />
      ) : null}
    </ScrollScreen>
  );
}

function PendingJoinCard({ request }: { request: MyPendingJoinRequest }) {
  const name = request.ride?.name ?? 'Ride';
  return (
    <View
      accessibilityLabel={`${name}, waiting for owner approval`}
      style={styles.pendingCard}
    >
      <View style={styles.pendingBody}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.pendingTitle}>
          {name}
        </Text>
        <Text style={styles.pendingSubtitle}>Waiting for the owner to accept</Text>
      </View>
      <View style={styles.pendingChip}>
        <Ionicons color={colors.accent} name="time-outline" size={18} />
      </View>
    </View>
  );
}

function RideGroup({
  label,
  rides,
  summaries,
}: {
  label: string;
  rides: readonly UserRide[];
  summaries: ReturnType<typeof useRideMemberSummaries>['data'];
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {rides.map((ride) => (
        <RideListCard
          key={ride.id}
          onPress={() => goHomeWithRide(ride.id)}
          ride={ride}
          summary={summaries?.[ride.id]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  intro: {
    gap: 4,
    paddingBottom: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  introTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  introSubtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
  },
  group: { gap: spacing.sm },
  groupLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingHorizontal: spacing.xxs,
  },
  pendingCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  pendingBody: { flex: 1, gap: 2, minWidth: 0 },
  pendingTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pendingSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  pendingChip: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
});
