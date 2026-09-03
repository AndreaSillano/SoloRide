import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { RideCard } from '@/components/ride-card';
import { Body, CenteredBusy, ScrollScreen, StatePanel } from '@/components/ui';
import {
  groupUserRides,
  useMyPendingJoinRequests,
  useUserRides,
  type MyPendingJoinRequest,
  type UserRide,
} from '@/features/rides';
import { colors, radius, spacing } from '@/theme';

export default function YourRidesScreen() {
  const { user } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const pending = useMyPendingJoinRequests(user?.id);
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
    <ScrollScreen>
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
        <RideGroup label="Active" rides={groups.active} userId={user?.id} />
      ) : null}
      {groups.upcoming.length ? (
        <RideGroup label="Upcoming" rides={groups.upcoming} userId={user?.id} />
      ) : null}
      {groups.archived.length ? (
        <RideGroup label="Archived" rides={groups.archived} userId={user?.id} />
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
  userId,
}: {
  label: string;
  rides: readonly UserRide[];
  userId: string | null | undefined;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {rides.map((ride) => (
        <RideCard key={ride.id} ride={ride} userId={userId} />
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
  pendingCard: {
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
