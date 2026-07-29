import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { RideForm } from '@/components/ride-form';
import {
  Body,
  Button,
  Card,
  CenteredBusy,
  ErrorBanner,
  Heading,
  ScrollScreen,
  SectionTitle,
  StatePanel,
  WeekdaySelector,
} from '@/components/ui';
import {
  requestNotificationRefresh,
  useSoloRideNotifications,
} from '@/features/notifications';
import {
  MAX_RIDE_MEMBERS,
  rideFormSchema,
  useArchiveRide,
  useDeleteRide,
  useLeaveRide,
  useRide,
  useRideMembers,
  useRideSchedule,
  useUnarchiveRide,
  useUpdateRide,
  type RideFormValues,
} from '@/features/rides';
import { formatProfileName } from '@/features/posts';
import { colors, spacing } from '@/theme';

const EMPTY_FORM: RideFormValues = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  neverEnds: false,
  notificationTime: '09:00',
  weekdays: [],
  strictSchedule: true,
};

function formatRideDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCreatedOn(isoDate: string) {
  return new Date(isoDate).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatNotificationTime(value: string) {
  const [hours = '0', minutes = '0'] = value.slice(0, 5).split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMemberRole(role: string) {
  return role === 'creator' ? 'Owner' : 'Member';
}

export default function RideSettingsScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { user } = useCurrentUser();
  const ride = useRide(rideId);
  const schedule = useRideSchedule(rideId);
  const members = useRideMembers(rideId);
  const updateRide = useUpdateRide(user?.id);
  const archiveRide = useArchiveRide(user?.id);
  const unarchiveRide = useUnarchiveRide(user?.id);
  const leaveRide = useLeaveRide(user?.id);
  const deleteRide = useDeleteRide(user?.id);
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const [form, setForm] = useState<RideFormValues>(EMPTY_FORM);
  const [initializedRideId, setInitializedRideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ride.data || !schedule.data || initializedRideId === ride.data.id) return;
    setForm({
      name: ride.data.name,
      description: ride.data.description ?? '',
      startDate: ride.data.start_date,
      endDate: ride.data.end_date ?? '',
      neverEnds: ride.data.end_date === null,
      notificationTime: ride.data.notification_time.slice(0, 5),
      weekdays: schedule.data.map((day) => day.weekday),
      strictSchedule: ride.data.strict_schedule,
    });
    setInitializedRideId(ride.data.id);
  }, [initializedRideId, ride.data, schedule.data]);

  const save = async () => {
    const parsed = rideFormSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the Ride details.');
      return;
    }
    setError(null);
    setSaved(false);
    try {
      await updateRide.mutateAsync({ rideId, ...parsed.data });
      requestNotificationRefresh();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Ride could not be updated.');
    }
  };

  const confirmArchive = () => {
    Alert.alert('Archive this Ride?', 'Members will keep read-only access, but posting will stop.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          setError(null);
          void archiveRide
            .mutateAsync(rideId)
            .then(async () => {
              await notifications.onRideLeftOrArchived(rideId).catch(() => []);
              setInitializedRideId(null);
              setSaved(false);
            })
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : 'The Ride could not be archived.'),
            );
        },
      },
    ]);
  };

  const confirmRestore = () => {
    Alert.alert(
      'Restore this Ride?',
      'It will become live again. If it had already ended, it will reopen with no end date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            setError(null);
            void unarchiveRide
              .mutateAsync(rideId)
              .then(() => {
                requestNotificationRefresh();
                setInitializedRideId(null);
                setSaved(false);
              })
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : 'The Ride could not be restored.',
                ),
              );
          },
        },
      ],
    );
  };

  const exitRide = async () => {
    await notifications.onRideLeftOrArchived(rideId).catch(() => []);
    router.replace('/');
  };

  const confirmLeave = () => {
    const creatorLeaving = ride.data?.creator_id === user?.id;
    Alert.alert(
      'Leave this Ride?',
      creatorLeaving
        ? 'Ownership will pass to the next member. You will lose access to its private photos.'
        : 'You will lose access to its private photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            setError(null);
            void leaveRide
              .mutateAsync(rideId)
              .then(() => exitRide())
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : 'You could not leave the Ride.'),
              );
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this Ride permanently?',
      'Photos, comments, and the join code will be gone forever. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => {
            setError(null);
            void deleteRide
              .mutateAsync(rideId)
              .then(() => exitRide())
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : 'The Ride could not be deleted.',
                ),
              );
          },
        },
      ],
    );
  };

  if (ride.isPending || schedule.isPending) {
    return (
      <ScrollScreen>
        <CenteredBusy message="Loading Ride settings…" />
      </ScrollScreen>
    );
  }
  if (ride.isError || schedule.isError || !ride.data) {
    return (
      <ScrollScreen>
        <StatePanel
          actionLabel="Try again"
          message="Ride settings could not load."
          onAction={() => {
            void ride.refetch();
            void schedule.refetch();
          }}
          title="Settings unavailable"
        />
      </ScrollScreen>
    );
  }

  const isCreator = ride.data.creator_id === user?.id;
  const scheduledWeekdays = schedule.data?.map((day) => day.weekday) ?? [];
  const memberCount = members.data?.length ?? 0;
  const isLastMember = memberCount === 1;
  const dangerBusy =
    archiveRide.isPending ||
    leaveRide.isPending ||
    deleteRide.isPending ||
    unarchiveRide.isPending;

  return (
    <ScrollScreen>
      <Heading>Ride settings</Heading>
      <Card>
        <View style={styles.detailBlock}>
          <Body muted>{ride.data.is_archived ? 'Archived Ride window' : 'Ride window'}</Body>
          <Text style={styles.detailValue}>
            {formatRideDate(ride.data.start_date)}
            {ride.data.end_date ? ` – ${formatRideDate(ride.data.end_date)}` : ' · Never ends'}
          </Text>
        </View>
        <View style={styles.detailBlock}>
          <Body muted>Notification time</Body>
          <Text style={styles.detailValue}>
            {formatNotificationTime(ride.data.notification_time)}
          </Text>
        </View>
        <View style={styles.detailBlock}>
          <Body muted>Scheduled days</Body>
          <WeekdaySelector disabled onChange={() => undefined} value={scheduledWeekdays} />
        </View>
        <View style={styles.detailBlock}>
          <Body muted>Schedule mode</Body>
          <Text style={styles.detailValue}>
            {ride.data.strict_schedule
              ? 'Strict — post every scheduled day'
              : 'Flexible — one scheduled day per week'}
          </Text>
        </View>
      </Card>

      <Card>
        <Body muted>Private join code</Body>
        <Text style={styles.code}>{ride.data.code}</Text>
        <Button
          variant="secondary"
          onPress={() =>
            void Share.share({
              message: `Join my SoloRide “${ride.data.name}” with code ${ride.data.code}`,
            })
          }
        >
          Copy or share code
        </Button>
      </Card>

      {isCreator ? (
        <>
          <SectionTitle>Ride details</SectionTitle>
          <RideForm
            disabled={updateRide.isPending || ride.data.is_archived}
            onChange={(value) => {
              setForm(value);
              setSaved(false);
            }}
            value={form}
          />
          {saved ? <Body>Changes saved ✓</Body> : null}
          <ErrorBanner message={error} />
          {!ride.data.is_archived ? (
            <Button loading={updateRide.isPending} onPress={() => void save()}>
              Save changes
            </Button>
          ) : null}
        </>
      ) : (
        <Body muted>Only the Ride owner can change the schedule and details.</Body>
      )}

      <SectionTitle>
        Members · {members.isPending ? '…' : `${memberCount} / ${MAX_RIDE_MEMBERS}`}
      </SectionTitle>
      {members.isPending ? (
        <Body muted>Loading members…</Body>
      ) : members.isError ? (
        <StatePanel
          actionLabel="Retry"
          message="Members could not load."
          onAction={() => void members.refetch()}
        />
      ) : (
        members.data?.map((member) => (
          <View key={member.id} style={styles.member}>
            <Text style={styles.memberName}>
              {formatProfileName(member.profile, 'Member')}
            </Text>
            <Text style={styles.role}>{formatMemberRole(member.role)}</Text>
          </View>
        ))
      )}
      {!members.isPending && !members.isError ? (
        <Body muted>
          {memberCount >= MAX_RIDE_MEMBERS
            ? 'This Ride is full.'
            : `${MAX_RIDE_MEMBERS - memberCount} spot${
                MAX_RIDE_MEMBERS - memberCount === 1 ? '' : 's'
              } left.`}
        </Body>
      ) : null}

      {!ride.data.is_archived ? (
        isCreator ? (
          <Button loading={archiveRide.isPending} variant="danger" onPress={confirmArchive}>
            Archive Ride
          </Button>
        ) : (
          <Button loading={leaveRide.isPending} variant="danger" onPress={confirmLeave}>
            Leave Ride
          </Button>
        )
      ) : (
        <View style={styles.dangerActions}>
          {isCreator ? (
            <Button
              disabled={dangerBusy}
              loading={unarchiveRide.isPending}
              onPress={confirmRestore}
            >
              Restore Ride
            </Button>
          ) : null}
          {isCreator && isLastMember ? (
            <Button
              disabled={dangerBusy}
              loading={deleteRide.isPending}
              variant="danger"
              onPress={confirmDelete}
            >
              Delete Ride permanently
            </Button>
          ) : (
            <Button
              disabled={dangerBusy}
              loading={leaveRide.isPending}
              variant="danger"
              onPress={confirmLeave}
            >
              Leave Ride
            </Button>
          )}
          {isCreator && !isLastMember ? (
            <Body muted>
              Leaving transfers ownership to the next member. Delete is only available when you are
              the last person in the Ride.
            </Body>
          ) : null}
        </View>
      )}

      <Text style={styles.createdBy}>
        Created by{' '}
        {formatProfileName(
          members.data?.find((member) => member.user_id === ride.data.creator_id)?.profile ??
            members.data?.find((member) => member.role === 'creator')?.profile,
          'Owner',
        )}{' '}
        — {formatCreatedOn(ride.data.created_at)}
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  code: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  detailBlock: { gap: spacing.xxs },
  detailValue: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  member: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  memberName: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '600' },
  role: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  dangerActions: { gap: spacing.sm },
  createdBy: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    paddingTop: spacing.md,
    textAlign: 'center',
  },
});
