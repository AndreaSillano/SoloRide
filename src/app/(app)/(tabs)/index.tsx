import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { RideCard } from '@/components/ride-card';
import { RideOverview } from '@/components/ride-overview';
import { FixedHeaderScreen, RideFeedSkeleton, StatePanel } from '@/components/ui';
import { requestNotificationRefresh } from '@/features/notifications';
import { useRideFeed } from '@/features/posts';
import {
  groupUserRides,
  useRidesDueToday,
  useSelectedRide,
  useUserRides,
} from '@/features/rides';
import { queryKeys } from '@/lib/queryKeys';
import { colors, radius, shadows, spacing } from '@/theme';

type MenuState = 'switcher' | 'create' | null;

export default function HomeScreen() {
  const { user } = useCurrentUser();
  const { selectRideId: pendingSelectRideId, notificationOpenId, openCommentsPostId } =
    useLocalSearchParams<{
      selectRideId?: string;
      notificationOpenId?: string;
      openCommentsPostId?: string;
    }>();
  const queryClient = useQueryClient();
  const rides = useUserRides(user?.id);
  const { selectedRideId, selectRide, isReady } = useSelectedRide(rides.data, user?.id);
  const feed = useRideFeed(selectedRideId);
  const due = useRidesDueToday(user?.id);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<MenuState>(null);
  const [refreshing, setRefreshing] = useState(false);
  const selectedNeedsPublication = Boolean(
    due.data?.postableRides.some(
      (ride) => ride.id === selectedRideId && ride.isRequiredToday,
    ),
  );

  // Lets other screens (join/create Ride) and notification taps hand off which
  // Ride should become selected once we land back on this tab. notificationOpenId
  // re-triggers selection when the same rideId is opened again from a push.
  useEffect(() => {
    if (pendingSelectRideId) selectRide(pendingSelectRideId);
  }, [pendingSelectRideId, notificationOpenId, selectRide]);

  const groups = groupUserRides(rides.data ?? []);
  const selectedRide = rides.data?.find((ride) => ride.id === selectedRideId) ?? null;
  const hasRides = Boolean(rides.data?.length);

  const closeMenu = () => setMenu(null);
  const toggleMenu = (next: Exclude<MenuState, null>) =>
    setMenu((current) => (current === next ? null : next));

  const handleSelectRide = (rideId: string) => {
    selectRide(rideId);
    closeMenu();
  };
  const openSettings = () => {
    if (!selectedRideId) return;
    closeMenu();
    router.push({ pathname: '/ride/[rideId]/settings', params: { rideId: selectedRideId } });
  };
  const openCreateRide = () => {
    closeMenu();
    router.push('/create-ride');
  };
  const openJoinRide = () => {
    closeMenu();
    router.push('/join-ride');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const tasks: Promise<unknown>[] = [
        rides.refetch(),
        queryClient.invalidateQueries({ queryKey: ['rides-due-today'] }),
        queryClient.invalidateQueries({ queryKey: ['camera-rides'] }),
      ];
      if (selectedRideId) {
        tasks.push(
          feed.refetch(),
          queryClient.invalidateQueries({ queryKey: queryKeys.ride(selectedRideId) }),
          queryClient.invalidateQueries({ queryKey: ['ride-schedule', selectedRideId] }),
          queryClient.invalidateQueries({ queryKey: ['posted-status', selectedRideId] }),
          queryClient.invalidateQueries({ queryKey: ['week-posted-status', selectedRideId] }),
        );
      }
      await Promise.all(tasks);
      requestNotificationRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <>
      {menu ? (
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={closeMenu}
          style={[styles.overlay, { height: windowHeight }]}
        />
      ) : null}
      <View
        style={[
          styles.headerRow,
          selectedRide?.description ? styles.headerRowWithDescription : null,
        ]}
      >
        <View style={styles.switcherWrap}>
          <Pressable
            accessibilityLabel={
              selectedNeedsPublication
                ? `${selectedRide?.name ?? 'Your Rides'}, photo due today`
                : undefined
            }
            accessibilityRole="button"
            disabled={!hasRides}
            onPress={() => toggleMenu('switcher')}
            style={({ pressed }) => [styles.switcherTrigger, pressed && styles.pressed]}
          >
            <View style={styles.switcherTitleWrap}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.switcherText}>
                {rides.isPending ? 'Loading…' : (selectedRide?.name ?? 'Your Rides')}
              </Text>
              {selectedNeedsPublication ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.dueBadge}
                />
              ) : null}
            </View>
            {hasRides ? (
              <Ionicons
                color={colors.text}
                name={menu === 'switcher' ? 'chevron-up' : 'chevron-down'}
                size={18}
              />
            ) : null}
          </Pressable>

          {menu === 'switcher' ? (
            <View style={styles.switcherPanel}>
              <ScrollView
                contentContainerStyle={styles.switcherPanelContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {groups.active.length ? (
                  <>
                    <Text style={styles.groupLabel}>Active</Text>
                    {groups.active.map((ride) => (
                      <RideCard
                        key={ride.id}
                        onPress={() => handleSelectRide(ride.id)}
                        ride={ride}
                        userId={user?.id}
                      />
                    ))}
                  </>
                ) : null}
                {groups.upcoming.length ? (
                  <>
                    <Text style={styles.groupLabel}>Upcoming</Text>
                    {groups.upcoming.map((ride) => (
                      <RideCard
                        key={ride.id}
                        onPress={() => handleSelectRide(ride.id)}
                        ride={ride}
                        userId={user?.id}
                      />
                    ))}
                  </>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Ride settings"
            accessibilityRole="button"
            disabled={!selectedRideId}
            hitSlop={8}
            onPress={openSettings}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons
              color={selectedRideId ? colors.text : colors.muted}
              name="settings-outline"
              size={22}
            />
          </Pressable>

          <View style={styles.plusWrap}>
            <Pressable
              accessibilityLabel="Create or join a Ride"
              accessibilityRole="button"
              onPress={() => toggleMenu('create')}
              style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.white} name="add" size={22} />
            </Pressable>

            {menu === 'create' ? (
              <View style={styles.createPanel}>
                <Pressable
                  accessibilityRole="button"
                  onPress={openCreateRide}
                  style={({ pressed }) => [styles.createRow, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.text} name="add-circle-outline" size={20} />
                  <Text style={styles.createRowText}>New Ride</Text>
                </Pressable>
                <View style={styles.createDivider} />
                <Pressable
                  accessibilityRole="button"
                  onPress={openJoinRide}
                  style={({ pressed }) => [styles.createRow, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.text} name="key-outline" size={20} />
                  <Text style={styles.createRowText}>Join with code</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {selectedRide?.description ? (
        <Text numberOfLines={2} style={styles.rideDescription}>
          {selectedRide.description}
        </Text>
      ) : null}
    </>
  );

  return (
    <FixedHeaderScreen
      contentStyle={{ paddingBottom: insets.bottom + spacing.sm }}
      header={header}
      onScroll={selectedRideId ? feed.loadMoreIfNearEnd : undefined}
      refreshControl={
        hasRides ? (
          <RefreshControl
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      {rides.isPending || !isReady ? (
        <RideFeedSkeleton />
      ) : rides.isError ? (
        <StatePanel
          actionLabel="Try again"
          message={rides.error instanceof Error ? rides.error.message : 'Your Rides could not load.'}
          onAction={() => void rides.refetch()}
          title="Couldn’t load Rides"
        />
      ) : !hasRides ? (
        <StatePanel
          actionLabel="Create a Ride"
          message="Start a private photo rhythm, or join with a friend’s code."
          onAction={openCreateRide}
          onSecondaryAction={openJoinRide}
          secondaryActionLabel="Join with code"
          title="Your first Ride starts here"
        />
      ) : selectedRideId ? (
        refreshing ? (
          <RideFeedSkeleton />
        ) : (
          <RideOverview
            commentsOpenKey={
              typeof notificationOpenId === 'string' ? notificationOpenId : null
            }
            compact
            onCommentsOpened={() => {
              router.setParams({ openCommentsPostId: undefined });
            }}
            openCommentsPostId={
              typeof openCommentsPostId === 'string' ? openCommentsPostId : null
            }
            rideId={selectedRideId}
            showHeading={false}
          />
        )
      ) : (
        <RideFeedSkeleton count={1} />
      )}
    </FixedHeaderScreen>
  );
}

const styles = StyleSheet.create({
  overlay: { left: -1000, position: 'absolute', right: -1000, top: 0 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    zIndex: 2,
  },
  headerRowWithDescription: {
    paddingBottom: spacing.xxs,
  },
  rideDescription: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    zIndex: 0,
  },
  switcherWrap: { flex: 1, position: 'relative', zIndex: 2 },
  switcherTrigger: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
  },
  switcherText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  switcherTitleWrap: {
    flexShrink: 1,
    position: 'relative',
  },
  dueBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 8,
    position: 'absolute',
    right: -8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 4,
    top: -1,
    width: 8,
  },
  switcherPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    left: 0,
    marginTop: spacing.xxs,
    maxHeight: 380,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 3,
    ...shadows.floating,
    elevation: 8,
  },
  switcherPanelContent: { gap: spacing.sm, padding: spacing.sm },
  groupLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    textTransform: 'uppercase',
  },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  plusWrap: { position: 'relative' },
  plusButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  createPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xxs,
    minWidth: 190,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: '100%',
    ...shadows.floating,
  },
  createRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createRowText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  createDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.7 },
});
