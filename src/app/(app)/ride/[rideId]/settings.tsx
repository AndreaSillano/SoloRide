import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { ChallengeListRow } from '@/components/challenge-list-row';
import { ChallengePickerModal } from '@/components/challenge-picker-modal';
import { RideForm } from '@/components/ride-form';
import { GlassSurface } from '@/components/glass';
import { RideHistoryCalendar } from '@/components/ride-history-calendar';
import {
  Avatar,
  Body,
  Button,
  CenteredBusy,
  ErrorBanner,
  StatePanel,
} from '@/components/ui';
import { SegmentedControl } from '@expo/ui/community/segmented-control';
import {
  estimateNextAutoChallengeDate,
  formatChallengeCalendarDate,
  useChallengeCatalog,
  useOpenRideChallenge,
  useRideChallengeHistory,
  type ChallengeCatalogItem,
  type RideChallenge,
} from '@/features/challenges';
import {
  requestNotificationRefresh,
  useSoloRideNotifications,
} from '@/features/notifications';
import {
  MAX_RIDE_MEMBERS,
  formatScheduleDays,
  formatScheduleMode,
  formatScheduleRhythm,
  rideFormSchema,
  useAcceptRideJoinRequest,
  useArchiveRide,
  useDeleteRide,
  useLeaveRide,
  useRejectRideJoinRequest,
  useRemoveRideMember,
  useRide,
  useRideJoinRequests,
  useRideMembers,
  useRideSchedule,
  useUnarchiveRide,
  useUpdateRide,
  type Ride,
  type RideFormValues,
  type RideJoinRequest,
  type RideMember,
  type RideScheduleDay,
} from '@/features/rides';
import { formatProfileName } from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { queryKeys } from '@/lib/queryKeys';
import { colors, radius, spacing } from '@/theme';

const EMPTY_FORM: RideFormValues = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  neverEnds: false,
  notificationTime: '09:00',
  scheduleKind: 'weekly',
  weekdays: [],
  monthDay: 1,
  weekdayOrdinal: 1,
  strictSchedule: true,
  challengesEnabled: true,
};

type SettingsTab = 'details' | 'people' | 'history' | 'challenges';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'people', label: 'People' },
  { id: 'history', label: 'History' },
  { id: 'challenges', label: 'Challenges' },
];

function parseSettingsTab(value: string | undefined): SettingsTab | null {
  if (
    value === 'people' ||
    value === 'details' ||
    value === 'history' ||
    value === 'challenges'
  ) {
    return value;
  }
  if (value === 'manage') return 'history';
  return null;
}

function formFromRide(ride: Ride, schedule: RideScheduleDay[]): RideFormValues {
  return {
    name: ride.name,
    description: ride.description ?? '',
    startDate: ride.start_date,
    endDate: ride.end_date ?? '',
    neverEnds: ride.end_date === null,
    notificationTime: ride.notification_time.slice(0, 5),
    scheduleKind: ride.schedule_kind ?? 'weekly',
    weekdays: schedule.map((day) => day.weekday),
    monthDay: ride.month_day ?? 1,
    weekdayOrdinal: ride.weekday_ordinal ?? 1,
    strictSchedule: ride.strict_schedule,
    challengesEnabled: ride.challenges_enabled ?? true,
  };
}

function formatRideDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
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

function useSafeHeaderHeight() {
  try {
    return useHeaderHeight();
  } catch {
    return 0;
  }
}

function MetaRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SettingsShell({
  header,
  children,
  refreshControl,
}: {
  header: ReactNode;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  const headerHeight = useSafeHeaderHeight();
  const insets = useSafeAreaInsets();
  const edges: Edge[] = headerHeight > 0 ? ['left', 'right'] : ['top', 'left', 'right'];
  // Offset the whole shell (not only the ScrollView) so the transparent Stack
  // header band stays free for the back button — same idea as ScrollScreen.
  const headerOffset = headerHeight > 0 ? headerHeight + spacing.xxs : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.shell, headerOffset > 0 && { marginTop: headerOffset }]}
    >
      <SafeAreaView edges={edges} style={styles.shellFill}>
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: spacing.xl + insets.bottom },
            header == null && styles.scrollContentCentered,
          ]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          style={styles.shellFill}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export default function RideSettingsScreen() {
  const { rideId, tab: tabParam } = useLocalSearchParams<{ rideId: string; tab?: string }>();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const ride = useRide(rideId);
  const schedule = useRideSchedule(rideId);
  const members = useRideMembers(rideId);
  const isCreator = ride.data?.creator_id === user?.id;
  const joinRequests = useRideJoinRequests(rideId, Boolean(isCreator));
  const updateRide = useUpdateRide(user?.id);
  const archiveRide = useArchiveRide(user?.id);
  const unarchiveRide = useUnarchiveRide(user?.id);
  const leaveRide = useLeaveRide(user?.id);
  const deleteRide = useDeleteRide(user?.id);
  const acceptRequest = useAcceptRideJoinRequest(user?.id);
  const rejectRequest = useRejectRideJoinRequest(user?.id);
  const removeMember = useRemoveRideMember(user?.id);
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const challengeHistory = useRideChallengeHistory(rideId);
  const challengeCatalog = useChallengeCatalog(Boolean(isCreator));
  const openChallenge = useOpenRideChallenge();
  const initialTab: SettingsTab = parseSettingsTab(tabParam) ?? 'details';
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RideFormValues>(EMPTY_FORM);
  const [initializedRideId, setInitializedRideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [challengePickerOpen, setChallengePickerOpen] = useState(false);
  const notifiedRideId = useRef<string | null>(null);

  useEffect(() => {
    if (!ride.data || !schedule.data || initializedRideId === ride.data.id) return;
    setForm(formFromRide(ride.data, schedule.data));
    setInitializedRideId(ride.data.id);
  }, [initializedRideId, ride.data, schedule.data]);

  useEffect(() => {
    if (!ride.data || notifiedRideId.current === ride.data.id) return;
    notifiedRideId.current = ride.data.id;
    requestNotificationRefresh();
  }, [ride.data]);

  useEffect(() => {
    const next = parseSettingsTab(tabParam);
    if (next) setTab(next);
  }, [tabParam]);

  const applyFormFromQueries = () => {
    if (!ride.data || !schedule.data) return;
    setForm(formFromRide(ride.data, schedule.data));
    setInitializedRideId(ride.data.id);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [rideResult, scheduleResult] = await Promise.all([
        ride.refetch(),
        schedule.refetch(),
        members.refetch(),
        challengeHistory.refetch(),
        ...(isCreator ? [joinRequests.refetch(), challengeCatalog.refetch()] : []),
        queryClient.invalidateQueries({ queryKey: ['rides-due-today'] }),
        ...(user?.id
          ? [queryClient.invalidateQueries({ queryKey: queryKeys.rides(user.id) })]
          : []),
      ]);
      const freshRide = rideResult.data;
      const freshSchedule = scheduleResult.data;
      if (freshRide && freshSchedule) {
        setForm(formFromRide(freshRide, freshSchedule));
        setInitializedRideId(freshRide.id);
      } else {
        applyFormFromQueries();
      }
      setSaved(false);
      requestNotificationRefresh();
    } finally {
      setRefreshing(false);
    }
  };

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
      const [rideResult, scheduleResult] = await Promise.all([
        ride.refetch(),
        schedule.refetch(),
      ]);
      if (rideResult.data && scheduleResult.data) {
        setForm(formFromRide(rideResult.data, scheduleResult.data));
        setInitializedRideId(rideResult.data.id);
      }
      requestNotificationRefresh();
      haptics.success();
      setSaved(true);
      setEditing(false);
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'The Ride could not be updated.');
    }
  };

  const startEditing = () => {
    if (!ride.data || !schedule.data) return;
    setForm(formFromRide(ride.data, schedule.data));
    setSaved(false);
    setError(null);
    setEditing(true);
    haptics.selection();
  };

  const cancelEditing = () => {
    if (ride.data && schedule.data) {
      setForm(formFromRide(ride.data, schedule.data));
    }
    setSaved(false);
    setError(null);
    setEditing(false);
    haptics.selection();
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
              haptics.warning();
              await notifications.onRideLeftOrArchived(rideId).catch(() => []);
              setInitializedRideId(null);
              setSaved(false);
            })
            .catch((cause: unknown) => {
              haptics.error();
              setError(cause instanceof Error ? cause.message : 'The Ride could not be archived.');
            });
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
                haptics.success();
                requestNotificationRefresh();
                setInitializedRideId(null);
                setSaved(false);
              })
              .catch((cause: unknown) => {
                haptics.error();
                setError(
                  cause instanceof Error ? cause.message : 'The Ride could not be restored.',
                );
              });
          },
        },
      ],
    );
  };

  const exitRide = async () => {
    await notifications.onRideLeftOrArchived(rideId).catch(() => []);
    // Pop back to Home (right → left), same as leaving create/join.
    router.dismissTo('/');
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
              .then(() => {
                haptics.warning();
                return exitRide();
              })
              .catch((cause: unknown) => {
                haptics.error();
                setError(cause instanceof Error ? cause.message : 'You could not leave the Ride.');
              });
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
              .then(() => {
                haptics.warning();
                return exitRide();
              })
              .catch((cause: unknown) => {
                haptics.error();
                setError(
                  cause instanceof Error ? cause.message : 'The Ride could not be deleted.',
                );
              });
          },
        },
      ],
    );
  };

  const confirmRemoveMember = (member: RideMember) => {
    const name = formatProfileName(member.profile, 'this member');
    Alert.alert('Remove member?', `${name} will lose access to this Ride’s private photos.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setError(null);
          setRemovingUserId(member.user_id);
          void removeMember
            .mutateAsync({ rideId, userId: member.user_id })
            .then(() => {
              haptics.warning();
            })
            .catch((cause: unknown) => {
              haptics.error();
              setError(
                cause instanceof Error ? cause.message : 'The member could not be removed.',
              );
            })
            .finally(() => {
              setRemovingUserId(null);
            });
        },
      },
    ]);
  };

  const handleAcceptRequest = (request: RideJoinRequest) => {
    setError(null);
    setActingRequestId(request.id);
    void acceptRequest
      .mutateAsync(request.id)
      .then(() => {
        haptics.success();
      })
      .catch((cause: unknown) => {
        haptics.error();
        setError(cause instanceof Error ? cause.message : 'The request could not be accepted.');
      })
      .finally(() => {
        setActingRequestId(null);
      });
  };

  const handleRejectRequest = (request: RideJoinRequest) => {
    const name = formatProfileName(request.profile, 'this person');
    Alert.alert('Decline request?', `${name} will not join this Ride.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          setError(null);
          setActingRequestId(request.id);
          void rejectRequest
            .mutateAsync(request.id)
            .then(() => {
              haptics.warning();
            })
            .catch((cause: unknown) => {
              haptics.error();
              setError(
                cause instanceof Error ? cause.message : 'The request could not be declined.',
              );
            })
            .finally(() => {
              setActingRequestId(null);
            });
        },
      },
    ]);
  };

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
  );

  if (ride.isPending || schedule.isPending) {
    return (
      <SettingsShell header={null} refreshControl={refreshControl}>
        <CenteredBusy message="Loading…" />
      </SettingsShell>
    );
  }

  if (ride.isError || schedule.isError || !ride.data) {
    return (
      <SettingsShell header={null} refreshControl={refreshControl}>
        <StatePanel
          message="Ride settings could not load."
          title="Settings unavailable"
        />
      </SettingsShell>
    );
  }

  const owner = isCreator;
  const scheduledWeekdays = schedule.data?.map((day) => day.weekday) ?? [];

  const nextScheduledChallengeLabel = useMemo(() => {
    if (!ride.data) return null;
    if (!ride.data.challenges_enabled) return 'Challenges are off';
    if (ride.data.is_archived) return null;

    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const history = challengeHistory.data ?? [];
    const startsThisMonth = history
      .map((item) => item.starts_at)
      .filter((startsAt) => {
        const date = new Date(startsAt);
        return date.getMonth() === month && date.getFullYear() === year;
      });
    const active = history.find((item) => new Date(item.ends_at).getTime() > now.getTime());
    const next = estimateNextAutoChallengeDate({
      challengesEnabled: ride.data.challenges_enabled,
      isArchived: ride.data.is_archived,
      rideEndDate: ride.data.end_date,
      scheduleKind: ride.data.schedule_kind ?? 'weekly',
      weekdayCount: scheduledWeekdays.length,
      startsThisMonth,
      activeEndsAt: active?.ends_at ?? null,
      now,
    });
    if (!next) return null;
    return `Next scheduled challenge ${formatChallengeCalendarDate(next)}`;
  }, [challengeHistory.data, ride.data, scheduledWeekdays.length]);
  const memberCount = members.data?.length ?? 0;
  const isLastMember = memberCount === 1;
  const pendingRequests = joinRequests.data ?? [];
  const pendingCount = pendingRequests.length;
  const dangerBusy =
    archiveRide.isPending ||
    leaveRide.isPending ||
    deleteRide.isPending ||
    unarchiveRide.isPending;
  const requestBusy = acceptRequest.isPending || rejectRequest.isPending;
  const windowValue = `${formatRideDate(ride.data.start_date)}${
    ride.data.end_date ? ` – ${formatRideDate(ride.data.end_date)}` : ' · Never ends'
  }`;

  const tabBar = (
    <View style={styles.tabBar}>
      <SegmentedControl
        appearance="light"
        onValueChange={(value) => {
          const item = TABS.find((tabItem) => tabItem.label === value);
          if (!item) return;
          haptics.selection();
          setTab(item.id);
          setError(null);
          if (item.id !== 'details') setEditing(false);
        }}
        selectedIndex={Math.max(
          0,
          TABS.findIndex((item) => item.id === tab),
        )}
        style={styles.segmented}
        tintColor={colors.primary}
        values={TABS.map((item) => item.label)}
      />
      {owner && pendingCount > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.tabDot}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <SettingsShell header={tabBar} refreshControl={refreshControl}>
        <ErrorBanner message={error} />

        {tab === 'details' ? (
        <View style={styles.tabBody}>
          <SectionLabel>Invite code</SectionLabel>
          <GlassSurface style={styles.inviteBlock}>
            <Text style={styles.code}>{ride.data.code}</Text>
            <Body muted>
              Share this code so someone can request to join. You approve them in People.
            </Body>
          </GlassSurface>
          <Button
            onPress={() =>
              void Share.share({
                message: `Join my Rhodeo “${ride.data.name}” with code ${ride.data.code}`,
              })
            }
          >
            Share invite code
          </Button>

          <View style={styles.dottedDivider} />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>
              {editing
                ? 'Edit ride'
                : ride.data.is_archived
                  ? 'Archived ride'
                  : 'Ride info'}
            </Text>
            {owner && !ride.data.is_archived ? (
              editing ? (
                <Pressable
                  accessibilityLabel="Cancel editing"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={cancelEditing}
                  style={styles.iconButton}
                >
                  <Ionicons color={colors.muted} name="close" size={22} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="Edit ride details"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={startEditing}
                  style={styles.iconButton}
                >
                  <Ionicons color={colors.primary} name="create-outline" size={22} />
                </Pressable>
              )
            ) : null}
          </View>

          {editing && owner && !ride.data.is_archived ? (
            <>
              <RideForm
                disabled={updateRide.isPending}
                onChange={(value) => {
                  setForm(value);
                  setSaved(false);
                }}
                value={form}
              />
              {saved ? <Body>Changes saved</Body> : null}
              <View style={styles.editActions}>
                <Button variant="secondary" onPress={cancelEditing}>
                  Cancel
                </Button>
                <Button loading={updateRide.isPending} onPress={() => void save()}>
                  Save changes
                </Button>
              </View>
            </>
          ) : (
            <>
              <GlassSurface style={styles.metaGroup}>
                <MetaRow label="Name" value={ride.data.name} />
                <MetaRow
                  label="Description"
                  value={ride.data.description?.trim() ? ride.data.description : '—'}
                />
                <MetaRow label="Window" value={windowValue} />
                <MetaRow
                  label="Notify"
                  value={formatNotificationTime(ride.data.notification_time)}
                />
                <MetaRow
                  label="Rhythm"
                  value={formatScheduleRhythm({
                    scheduleKind: ride.data.schedule_kind ?? 'weekly',
                  })}
                />
                {(ride.data.schedule_kind ?? 'weekly') === 'weekly' ? (
                  <MetaRow
                    label="Mode"
                    value={formatScheduleMode(ride.data.strict_schedule)}
                  />
                ) : null}
                <MetaRow
                  label="Days"
                  value={formatScheduleDays({
                    scheduleKind: ride.data.schedule_kind ?? 'weekly',
                    weekdays: scheduledWeekdays,
                    monthDay: ride.data.month_day,
                    weekdayOrdinal: ride.data.weekday_ordinal,
                  })}
                />
                <MetaRow
                  label="Challenges"
                  last
                  value={ride.data.challenges_enabled ? 'On' : 'Off'}
                />
              </GlassSurface>
              {!owner ? (
                <Body muted>Only the owner can edit schedule and details.</Body>
              ) : null}
            </>
          )}

          <View style={styles.dottedDivider} />

          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>Danger zone</Text>
            <Body muted>
              {ride.data.is_archived
                ? 'This Ride is archived. Posting is paused; members can still view photos.'
                : 'Archive pauses posting without deleting photos. Leaving removes your access.'}
            </Body>
            {!ride.data.is_archived ? (
              owner ? (
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
                {owner ? (
                  <Button
                    disabled={dangerBusy}
                    loading={unarchiveRide.isPending}
                    onPress={confirmRestore}
                  >
                    Restore Ride
                  </Button>
                ) : null}
                {owner && isLastMember ? (
                  <Button
                    disabled={dangerBusy}
                    loading={deleteRide.isPending}
                    variant="danger"
                    onPress={confirmDelete}
                  >
                    Delete permanently
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
                {owner && !isLastMember ? (
                  <Body muted>
                    Leaving transfers ownership to the next member. Delete is only available when
                    you are the last person in the Ride.
                  </Body>
                ) : null}
              </View>
            )}
          </View>
        </View>
      ) : null}

      {tab === 'people' ? (
        <View style={styles.tabBody}>
          {owner &&
          (joinRequests.isPending || joinRequests.isError || pendingCount > 0) ? (
            <>
              <SectionLabel>
                {joinRequests.isPending ? 'Requests' : `Requests · ${pendingCount}`}
              </SectionLabel>
              {joinRequests.isPending ? (
                <Body muted>Loading requests…</Body>
              ) : joinRequests.isError ? (
                <StatePanel
                  actionLabel="Retry"
                  message="Join requests could not load."
                  onAction={() => void joinRequests.refetch()}
                />
              ) : (
                pendingRequests.map((request, index) => {
                  const busy = actingRequestId === request.id && requestBusy;
                  const last = index === pendingRequests.length - 1;
                  return (
                    <View
                      key={request.id}
                      style={[styles.personRow, !last && styles.personRowBorder]}
                    >
                      <Avatar profile={request.profile} size={42} />
                      <View style={styles.personMeta}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {formatProfileName(request.profile, 'Rider')}
                        </Text>
                        <Text style={styles.personSub}>Wants to join</Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Button
                          compact
                          disabled={requestBusy}
                          loading={busy && acceptRequest.isPending}
                          onPress={() => handleAcceptRequest(request)}
                        >
                          Accept
                        </Button>
                        <Button
                          compact
                          disabled={requestBusy}
                          loading={busy && rejectRequest.isPending}
                          variant="secondary"
                          onPress={() => handleRejectRequest(request)}
                        >
                          Decline
                        </Button>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          ) : null}

          <SectionLabel>
            Members · {members.isPending ? '…' : `${memberCount} / ${MAX_RIDE_MEMBERS}`}
          </SectionLabel>
          {members.isPending ? (
            <Body muted>Loading members…</Body>
          ) : members.isError ? (
            <StatePanel
              actionLabel="Retry"
              message="Members could not load."
              onAction={() => void members.refetch()}
            />
          ) : (
            <GlassSurface style={styles.peopleCard}>
            {members.data?.map((member, index) => {
              const canRemove = owner && member.role !== 'creator' && !ride.data.is_archived;
              const last = index === (members.data?.length ?? 0) - 1;
              return (
                <View
                  key={member.id}
                  style={[styles.personRow, !last && styles.personRowBorder]}
                >
                  <Avatar profile={member.profile} size={42} />
                  <View style={styles.personMeta}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {formatProfileName(member.profile, 'Member')}
                    </Text>
                    <Text style={styles.personSub}>{formatMemberRole(member.role)}</Text>
                  </View>
                  {canRemove ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={removeMember.isPending}
                      hitSlop={8}
                      onPress={() => confirmRemoveMember(member)}
                      style={styles.removeLink}
                    >
                      <Text style={styles.removeLinkText}>
                        {removingUserId === member.user_id && removeMember.isPending
                          ? '…'
                          : 'Remove'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            </GlassSurface>
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
        </View>
      ) : null}

      {tab === 'history' ? (
        <View style={styles.tabBody}>
          <SectionLabel>Photo history</SectionLabel>
          <RideHistoryCalendar rideId={ride.data.id} />
        </View>
      ) : null}

      {tab === 'challenges' ? (
        <View style={styles.tabBody}>
          <SectionLabel>Challenges</SectionLabel>
          {owner ? (
            <GlassSurface style={styles.challengeOwnerBlock}>
              <Body muted>
                {ride.data.challenges_enabled
                  ? 'Debug: open a challenge manually for this Ride. Members get a push when it starts.'
                  : 'Challenges are turned off for this Ride. Enable them in Details to open one.'}
              </Body>
              <Button
                disabled={
                  openChallenge.isPending ||
                  Boolean(ride.data.is_archived) ||
                  !ride.data.challenges_enabled
                }
                onPress={() => {
                  haptics.selection();
                  setChallengePickerOpen(true);
                }}
              >
                Open challenge
              </Button>
            </GlassSurface>
          ) : null}

          {challengeHistory.isPending ? (
            <Body muted>Loading challenges…</Body>
          ) : challengeHistory.isError ? (
            <StatePanel
              actionLabel="Retry"
              message="Challenge history could not load."
              onAction={() => void challengeHistory.refetch()}
            />
          ) : (challengeHistory.data ?? []).length === 0 ? (
            <Body muted>No challenges have been opened on this Ride yet.</Body>
          ) : (
            <GlassSurface style={styles.challengeList}>
              {(challengeHistory.data ?? []).map((item: RideChallenge, index, list) => (
                <ChallengeListRow
                  key={item.id}
                  challenge={item}
                  last={index === list.length - 1}
                  onPress={() => {
                    haptics.light();
                    router.push({
                      pathname: '/ride/[rideId]/challenge/[rideChallengeId]',
                      params: {
                        rideId: ride.data.id,
                        rideChallengeId: item.id,
                      },
                    });
                  }}
                />
              ))}
            </GlassSurface>
          )}

          {nextScheduledChallengeLabel ? (
            <Body muted>{nextScheduledChallengeLabel}</Body>
          ) : null}
        </View>
      ) : null}
      </SettingsShell>

      <ChallengePickerModal
        challenges={challengeCatalog.data ?? []}
        loading={challengeCatalog.isPending}
        onClose={() => setChallengePickerOpen(false)}
        onSelect={(item: ChallengeCatalogItem) => {
          void openChallenge
            .mutateAsync({ rideId: ride.data.id, challengeId: item.id })
            .then(() => {
              haptics.success();
              setChallengePickerOpen(false);
              setError(null);
            })
            .catch((cause: unknown) => {
              haptics.error();
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'The challenge could not be opened.',
              );
            });
        }}
        selecting={openChallenge.isPending}
        visible={challengePickerOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.background, flex: 1 },
  shellFill: { flex: 1 },
  scrollContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  segmented: {
    width: '100%',
  },
  tabDot: {
    backgroundColor: colors.highlight,
    borderRadius: radius.pill,
    elevation: 4,
    height: 8,
    position: 'absolute',
    // People is the second segment of four.
    left: '34%',
    shadowColor: colors.highlight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    top: spacing.sm + 2,
    width: 8,
  },
  tabBody: {
    gap: spacing.md,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 36,
  },
  inviteBlock: {
    borderRadius: radius.lg,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md,
  },
  code: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 3,
  },
  shareButtonPressed: {
    opacity: 0.75,
  },
  editActions: {
    gap: spacing.sm,
  },
  metaGroup: {
    borderRadius: radius.lg,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
  },
  metaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  metaRowBorder: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metaLabel: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '600',
    paddingTop: 1,
  },
  metaValue: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'right',
  },
  peopleCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
  },
  personRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  personRowBorder: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personMeta: { flex: 1, gap: 2, minWidth: 0 },
  personName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  personSub: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  rowActions: { flexDirection: 'row', gap: spacing.xs },
  removeLink: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  removeLinkText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  dangerZone: {
    gap: spacing.sm,
  },
  dangerZoneTitle: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dangerActions: { gap: spacing.sm },
  challengeOwnerBlock: {
    borderRadius: radius.lg,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md,
  },
  challengeList: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
  },
  dottedDivider: {
    borderColor: colors.border,
    borderStyle: 'dotted',
    borderTopWidth: 1,
    marginVertical: spacing.xs,
  },
});
