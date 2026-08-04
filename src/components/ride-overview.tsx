import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import {
  formatProfileName,
  getOwnReactionScore,
  useDeletePost,
  useRemoveReaction,
  useRideFeed,
  useUpsertReaction,
} from '@/features/posts';
import { usePostingStatus, useRide, useRideMembers } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

import { CommentsModal } from './comments-modal';
import { ReactionsModal } from './reactions-modal';
import {
  Body,
  Button,
  Card,
  FeedPost,
  RideFeedSkeleton,
  SectionTitle,
  StatePanel,
} from './ui';

export function RideOverview({
  rideId,
  compact = false,
  openCommentsPostId,
  commentsOpenKey,
  onCommentsOpened,
}: {
  rideId: string;
  /** Hides the posted-today status line, Members section, and Photos label,
   * since that detail already lives on the Ride settings screen. */
  compact?: boolean;
  /** Opens the comments sheet for this post (e.g. from a mention/comment push). */
  openCommentsPostId?: string | null;
  /** Changes when a push asks to open comments again for the same post. */
  commentsOpenKey?: string | null;
  onCommentsOpened?: () => void;
}) {
  const { user } = useCurrentUser();
  const ride = useRide(rideId);
  const members = useRideMembers(compact ? null : rideId);
  const feed = useRideFeed(rideId);
  const posting = usePostingStatus(rideId, user?.id);
  const deletePost = useDeletePost();
  const upsertReaction = useUpsertReaction();
  const removeReaction = useRemoveReaction();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [reactionsPostId, setReactionsPostId] = useState<string | null>(null);
  const [pickerPostId, setPickerPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!openCommentsPostId) return;
    setActivePostId(openCommentsPostId);
    onCommentsOpened?.();
  }, [openCommentsPostId, commentsOpenKey, onCommentsOpened]);

  const confirmDeletePost = (postId: string) => {
    Alert.alert('Delete photo?', 'This permanently removes the photo and its comments.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setDeletingPostId(postId);
          void deletePost
            .mutateAsync({ postId, rideId })
            .then(() => {
              haptics.warning();
              setActivePostId((current) => (current === postId ? null : current));
              setReactionsPostId((current) => (current === postId ? null : current));
              setPickerPostId((current) => (current === postId ? null : current));
            })
            .catch((error) => {
              haptics.error();
              Alert.alert(
                'Couldn’t delete photo',
                error instanceof Error ? error.message : 'The photo could not be deleted.',
              );
            })
            .finally(() => setDeletingPostId(null));
        },
      },
    ]);
  };

  const handleDoubleTapImage = (postId: string) => {
    haptics.light();
    // Always open the scale so the user can change or clear (swipe to 0).
    setPickerPostId(postId);
  };

  const handleSelectReaction = (postId: string, score: number) => {
    const post = feed.data.find((item) => item.id === postId);
    const ownScore = post ? getOwnReactionScore(post, user?.id) : null;
    setPickerPostId(null);

    // Center (0) clears; releasing on the same score is a no-op.
    if (score === 0) {
      if (!ownScore) return;
      void removeReaction.mutateAsync({ postId, rideId }).catch((error) => {
        haptics.error();
        Alert.alert(
          'Couldn’t remove reaction',
          error instanceof Error ? error.message : 'The reaction could not be removed.',
        );
      });
      return;
    }

    if (ownScore === score) return;

    void upsertReaction
      .mutateAsync({ postId, rideId, score })
      .then(() => {
        haptics.medium();
      })
      .catch((error) => {
        haptics.error();
        Alert.alert(
          'Couldn’t save reaction',
          error instanceof Error ? error.message : 'The reaction could not be saved.',
        );
      });
  };

  if (ride.isPending) {
    return <RideFeedSkeleton />;
  }
  if (ride.isError || !ride.data) {
    return (
      <StatePanel
        actionLabel="Try again"
        message={ride.error instanceof Error ? ride.error.message : 'This Ride could not load.'}
        onAction={() => void ride.refetch()}
        title="Couldn’t open Ride"
      />
    );
  }

  const data = ride.data;

  return (
    <>
      {data.is_archived ? (
        <View style={styles.archivedBanner}>
          <Ionicons color={colors.muted} name="archive-outline" size={16} />
          <Text style={styles.archivedBannerText}>This Ride is archived</Text>
        </View>
      ) : null}
      {/* Home (compact) pins the description under the fixed ride header instead. */}
      {!compact && data.description ? <Body>{data.description}</Body> : null}

      {!compact ? (
        <>
          <Card>
            <Text style={styles.nextLabel}>
              {data.is_archived
                ? 'Archived'
                : posting.scheduledToday
                  ? posting.hasPosted
                    ? 'You posted today ✓'
                    : !posting.isRequiredToday
                      ? 'Optional today — you already posted this week'
                      : 'Today is a photo day'
                  : posting.nextDate
                    ? `Next photo: ${new Date(`${posting.nextDate}T12:00:00`).toLocaleDateString(
                        [],
                        { weekday: 'long', month: 'short', day: 'numeric' },
                      )}`
                    : 'No more posting days'}
            </Text>
            <Button
              disabled={data.is_archived}
              onPress={() =>
                router.push({ pathname: '/camera', params: { rideId } })
              }
            >
              {data.is_archived
                ? 'Ride archived'
                : posting.canPost
                  ? posting.isRequiredToday
                    ? 'Take today’s photo'
                    : 'Take a bonus photo'
                  : 'Share a 24h photo'}
            </Button>
            {!data.is_archived && !posting.canPost ? (
              <Body muted>
                Outside scheduled days, photos last 24 hours and don’t count as a publication.
              </Body>
            ) : null}
          </Card>

          <View style={styles.actions}>
            <Body>
              Code: <Text style={styles.code}>{data.code}</Text>
            </Body>
            <Button
              variant="secondary"
              onPress={() =>
                void Share.share({
                  message: `Join my SoloRide “${data.name}” with code ${data.code}`,
                })
              }
            >
              Share
            </Button>
          </View>
        </>
      ) : null}

      {!compact ? (
        <>
          <SectionTitle>Members</SectionTitle>
          {members.isPending ? (
            <Body muted>Loading members…</Body>
          ) : members.isError ? (
            <StatePanel
              actionLabel="Retry"
              message="Members could not load."
              onAction={() => void members.refetch()}
            />
          ) : (
            <Body muted>
              {members.data
                ?.map(
                  (member) => formatProfileName(member.profile, 'Member'),
                )
                .join(' · ') || 'No members found'}
            </Body>
          )}
        </>
      ) : null}

      {!compact ? <SectionTitle>Photos</SectionTitle> : null}
      {feed.isPending ? (
        <RideFeedSkeleton />
      ) : feed.isError ? (
        <StatePanel
          actionLabel="Try again"
          message={feed.error instanceof Error ? feed.error.message : 'The feed could not load.'}
          onAction={() => void feed.refetch()}
          title="Couldn’t load photos"
        />
      ) : feed.data.length ? (
        <View style={styles.feed}>
          {feed.data.map((post) => (
            <FeedPost
              key={post.id}
              deleting={deletingPostId === post.id}
              isOwnPost={post.user_id === user?.id}
              onCloseReactionPicker={() => setPickerPostId(null)}
              onDelete={() => confirmDeletePost(post.id)}
              onDoubleTapImage={() => handleDoubleTapImage(post.id)}
              onPress={() => setActivePostId(post.id)}
              onPressReactions={() => setReactionsPostId(post.id)}
              onSelectReaction={(score) => handleSelectReaction(post.id, score)}
              ownReactionScore={getOwnReactionScore(post, user?.id)}
              post={post}
              reactionPickerVisible={pickerPostId === post.id}
            />
          ))}
          {feed.isFetchingNextPage ? (
            <View style={styles.loadMore}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyFeed}>
          <View style={styles.emptyIconWrap}>
            <Ionicons color={colors.muted} name="images-outline" size={36} />
          </View>
          <Text style={styles.emptyTitle}>The ride looks empty</Text>
          <Text style={styles.emptyMessage}>
            Nobody’s posted yet. First one to drop a photo owns the bragging rights.
          </Text>
        </View>
      )}

      <CommentsModal
        onClose={() => setActivePostId(null)}
        postId={activePostId}
        rideId={rideId}
        visible={Boolean(activePostId)}
      />

      <ReactionsModal
        onClose={() => setReactionsPostId(null)}
        postId={reactionsPostId}
        visible={Boolean(reactionsPostId)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  archivedBanner: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  archivedBannerText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  nextLabel: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  code: { fontWeight: '800', letterSpacing: 1 },
  // Cancels ScrollScreen's horizontal padding so feed photos run edge-to-edge.
  feed: { marginHorizontal: -spacing.lg },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyFeed: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  emptyIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 56,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  emptyMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 260,
    textAlign: 'center',
  },
});
