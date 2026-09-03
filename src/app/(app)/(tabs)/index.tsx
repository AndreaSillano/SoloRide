import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useCallback, useRef, useState } from 'react';
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
import { GlassIconButton, GlassSurface } from '@/components/glass';
import { RideCard } from '@/components/ride-card';
import { RideOverview } from '@/components/ride-overview';
import { FixedHeaderScreen, Body, Button, Heading, RideFeedSkeleton } from '@/components/ui';
import { useCommentDeepLink, clearCommentDeepLink } from '@/features/notifications/deep-link';
import { requestNotificationRefresh } from '@/features/notifications';
import { POST_CAPTURE_TAB_BAR_CLEARANCE, useRideFeed } from '@/features/posts';
import {
  groupUserRides,
  useRideJoinRequests,
  useRidesStripExpanded,
  useSelectedRide,
  useUserRides,
} from '@/features/rides';
import { queryKeys } from '@/lib/queryKeys';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type MenuState = 'create' | null;

export default function HomeScreen() {
  const { user } = useCurrentUser();
  const { selectRideId: pendingSelectRideId, notificationOpenId } = useLocalSearchParams<{
    selectRideId?: string;
    notificationOpenId?: string;
  }>();
  const queryClient = useQueryClient();
  const rides = useUserRides(user?.id);
  const { selectedRideId, selectRide, isReady } = useSelectedRide(rides.data, user?.id);
  const feed = useRideFeed(selectedRideId);
  const commentDeepLink = useCommentDeepLink();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<MenuState>(null);
  const [ridesExpanded, setRidesExpanded] = useRidesStripExpanded(user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const feedScrollRef = useRef<ScrollView>(null);
  const feedScrollOffsetRef = useRef(0);

  // Lets other screens (join/create Ride) and notification taps hand off which
  // Ride should become selected once we land back on this tab. notificationOpenId
  // re-triggers selection when the same rideId is opened again from a push.
  useEffect(() => {
    if (pendingSelectRideId) selectRide(pendingSelectRideId);
  }, [pendingSelectRideId, notificationOpenId, selectRide]);

  // Comment/mention pushes queue an in-memory deep link (URL params are flaky
  // under Native Tabs). Select that Ride, then open comments once it matches.
  useEffect(() => {
    if (commentDeepLink) selectRide(commentDeepLink.rideId);
  }, [commentDeepLink, selectRide]);

  const openCommentsForSelectedRide =
    commentDeepLink && selectedRideId === commentDeepLink.rideId
      ? commentDeepLink.postId
      : null;
  const groups = groupUserRides(rides.data ?? []);
  const selectedRide = rides.data?.find((ride) => ride.id === selectedRideId) ?? null;
  const hasRides = Boolean(rides.data?.length);
  const hasPosts = Boolean(selectedRideId && feed.data.length > 0);
  // Keep scroll + RefreshControl mounted while refreshing — toggling them off
  // mid-pull unmounts the spinner and jumps the feed layout.
  const scrollEnabled = hasRides && (hasPosts || refreshing);
  const isOwnerOfSelected = selectedRide?.current_user_role === 'creator';
  const pendingJoins = useRideJoinRequests(selectedRideId, Boolean(isOwnerOfSelected));
  const hasPendingJoinRequests = Boolean(pendingJoins.data && pendingJoins.data.length > 0);

  const closeMenu = () => setMenu(null);
  const toggleCreateMenu = () =>
    setMenu((current) => (current === 'create' ? null : 'create'));

  const handleSelectRide = (rideId: string) => {
    if (rideId !== selectedRideId) haptics.light();
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

  const scrollPostIntoView = useCallback((postView: View) => {
    const scroll = feedScrollRef.current;
    if (!scroll) return;
    // ScrollView host views expose measureInWindow at runtime; typings omit it.
    const scrollView = scroll as unknown as View;
    postView.measureInWindow((_x, postY) => {
      scrollView.measureInWindow((_sx, scrollY) => {
        const nextY = Math.max(0, feedScrollOffsetRef.current + (postY - scrollY));
        scroll.scrollTo({ y: nextY, animated: true });
        feedScrollOffsetRef.current = nextY;
      });
    });
  }, []);

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
          queryClient.invalidateQueries({ queryKey: queryKeys.rideJoinRequests(selectedRideId) }),
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
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.wordmark}>Rhodeo</Text>
        <View style={styles.headerActions}>
          <View>
            <GlassIconButton
              accessibilityLabel={
                hasPendingJoinRequests
                  ? 'Ride settings, pending join requests'
                  : 'Ride settings'
              }
              disabled={!selectedRideId}
              icon="settings-outline"
              iconSize={18}
              onPress={openSettings}
              size={36}
            />
            {hasPendingJoinRequests ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.settingsBadge}
              />
            ) : null}
          </View>

          <View style={styles.plusWrap}>
            <Pressable
              accessibilityLabel="Create or join a Ride"
              accessibilityRole="button"
              onPress={toggleCreateMenu}
              style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.white} name="add" size={22} />
            </Pressable>

            {menu === 'create' ? (
              <GlassSurface style={styles.createPanel}>
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
              </GlassSurface>
            ) : null}
          </View>
        </View>
      </View>

      {hasRides ? (
        <>
          <View style={styles.ridesHeader}>
            <Pressable
              accessibilityLabel={
                ridesExpanded
                  ? selectedRide
                    ? `Hide rides, viewing ${selectedRide.name}`
                    : 'Hide rides'
                  : selectedRide
                    ? `Show rides, viewing ${selectedRide.name}`
                    : 'Show rides'
              }
              accessibilityRole="button"
              onPress={() => setRidesExpanded((current) => !current)}
              style={({ pressed }) => [styles.ridesToggle, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.ridesCurrent}>
                {selectedRide?.name ?? 'Your rides'}
              </Text>
              <Ionicons
                color={colors.muted}
                name={ridesExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
              />
            </Pressable>
          </View>

          {ridesExpanded ? (
            <ScrollView
              contentContainerStyle={styles.ridesStripContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {groups.active.map((ride) => (
                <RideCard
                  key={ride.id}
                  onPress={() => handleSelectRide(ride.id)}
                  ride={ride}
                  selected={ride.id === selectedRideId}
                  userId={user?.id}
                  variant="tile"
                />
              ))}
              {groups.upcoming.map((ride) => (
                <RideCard
                  key={ride.id}
                  onPress={() => handleSelectRide(ride.id)}
                  ride={ride}
                  selected={ride.id === selectedRideId}
                  userId={user?.id}
                  variant="tile"
                />
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <FixedHeaderScreen
      contentStyle={{
        paddingBottom: insets.bottom + spacing.sm + POST_CAPTURE_TAB_BAR_CLEARANCE,
      }}
      header={header}
      onScroll={(event) => {
        feedScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        if (menu) closeMenu();
        if (selectedRideId) feed.loadMoreIfNearEnd(event);
      }}
      overlay={
        menu ? (
          <Pressable
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            onPress={closeMenu}
            style={[styles.menuDismiss, { height: windowHeight }]}
          />
        ) : null
      }
      refreshControl={
        hasRides && (hasPosts || refreshing) ? (
          <RefreshControl
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        ) : undefined
      }
      scrollEnabled={scrollEnabled}
      scrollRef={feedScrollRef}
    >
      {rides.isPending || !isReady ? (
        <RideFeedSkeleton />
      ) : rides.isError ? (
        <View style={styles.emptyState}>
          <Heading>Couldn’t load Rides</Heading>
          <Body muted>
            {rides.error instanceof Error
              ? rides.error.message
              : 'Your Rides could not load.'}
          </Body>
          <View style={styles.emptyActions}>
            <Button onPress={() => void rides.refetch()}>Try again</Button>
          </View>
        </View>
      ) : !hasRides ? (
        <View style={styles.emptyState}>
          <Heading>Your first Ride starts here</Heading>
          <Body muted>
            Start a private photo rhythm, or join with a friend’s code.
          </Body>
          <View style={styles.emptyActions}>
            <Button onPress={openCreateRide}>Create a Ride</Button>
            <Button variant="secondary" onPress={openJoinRide}>
              Join with code
            </Button>
          </View>
        </View>
      ) : selectedRideId ? (
        refreshing && !commentDeepLink ? (
          <RideFeedSkeleton />
        ) : (
          <RideOverview
            commentsOpenKey={commentDeepLink?.key ?? null}
            compact
            onCommentsOpened={() => {
              clearCommentDeepLink();
            }}
            onScrollPostIntoView={scrollPostIntoView}
            openCommentsPostId={openCommentsForSelectedRide}
            rideId={selectedRideId}
          />
        )
      ) : (
        <RideFeedSkeleton count={1} />
      )}
    </FixedHeaderScreen>
  );
}

const styles = StyleSheet.create({
  menuDismiss: { left: -1000, position: 'absolute', right: -1000, top: 0, zIndex: 0 },
  emptyState: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  emptyActions: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    zIndex: 2,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  wordmark: {
    color: colors.primary,
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  settingsBadge: {
    backgroundColor: colors.highlight,
    borderRadius: radius.pill,
    elevation: 4,
    height: 8,
    position: 'absolute',
    right: 0,
    shadowColor: colors.highlight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    top: 0,
    width: 8,
  },
  plusWrap: { position: 'relative' },
  plusButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
    ...shadows.glow,
  },
  createPanel: {
    borderRadius: radius.md,
    marginTop: spacing.xxs,
    minWidth: 190,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: '100%',
    zIndex: 4,
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
  ridesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxs,
  },
  ridesToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
    minWidth: 0,
  },
  ridesCurrent: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  ridesStripContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  pressed: { opacity: 0.7 },
});
