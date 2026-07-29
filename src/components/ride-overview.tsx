import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { useCurrentUser } from '@/auth/auth-context';
import { formatProfileName, useDeletePost, useRideFeed } from '@/features/posts';
import { usePostingStatus, useRide, useRideMembers } from '@/features/rides';
import { colors, spacing } from '@/theme';

import { CommentsModal } from './comments-modal';
import { Body, Button, Card, FeedPost, Heading, SectionTitle, StatePanel } from './ui';

export function RideOverview({
  rideId,
  showHeading = true,
  compact = false,
}: {
  rideId: string;
  showHeading?: boolean;
  /** Hides the posted-today status line, Members section, and Photos label,
   * since that detail already lives on the Ride settings screen. */
  compact?: boolean;
}) {
  const { user } = useCurrentUser();
  const ride = useRide(rideId);
  const members = useRideMembers(compact ? null : rideId);
  const feed = useRideFeed(rideId);
  const posting = usePostingStatus(rideId, user?.id);
  const deletePost = useDeletePost();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

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
            .then(() => setActivePostId((current) => (current === postId ? null : current)))
            .catch(() => Alert.alert('The photo could not be deleted.'))
            .finally(() => setDeletingPostId(null));
        },
      },
    ]);
  };

  if (ride.isPending) {
    return <StatePanel loading message="Opening your Ride…" />;
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
      {showHeading ? (
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Heading>{data.name}</Heading>
            <Body muted>
              {new Date(`${data.start_date}T12:00:00`).toLocaleDateString()} –{' '}
              {new Date(`${data.end_date}T12:00:00`).toLocaleDateString()}
            </Body>
          </View>
          <Button
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/ride/[rideId]/settings', params: { rideId } })
            }
          >
            Settings
          </Button>
        </View>
      ) : null}
      {data.description ? <Body>{data.description}</Body> : null}

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
              disabled={!posting.canPost}
              onPress={() =>
                router.push({ pathname: '/camera', params: { rideId } })
              }
            >
              {posting.hasPosted
                ? 'Photo posted'
                : !posting.isRequiredToday
                  ? 'Take a bonus photo'
                  : 'Take today’s photo'}
            </Button>
            {!posting.scheduledToday && !data.is_archived ? (
              <Body muted>Posting opens only on a scheduled day.</Body>
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
        <StatePanel loading message="Loading private photos…" />
      ) : feed.isError ? (
        <StatePanel
          actionLabel="Try again"
          message={feed.error instanceof Error ? feed.error.message : 'The feed could not load.'}
          onAction={() => void feed.refetch()}
          title="Couldn’t load photos"
        />
      ) : feed.data?.length ? (
        <View style={styles.feed}>
          {feed.data.map((post) => (
            <FeedPost
              key={post.id}
              deleting={deletingPostId === post.id}
              isOwnPost={post.user_id === user?.id}
              onDelete={() => confirmDeletePost(post.id)}
              onPress={() => setActivePostId(post.id)}
              post={post}
            />
          ))}
        </View>
      ) : (
        <StatePanel message="The first scheduled photo will appear here." title="Quiet for now" />
      )}

      <CommentsModal
        onClose={() => setActivePostId(null)}
        postId={activePostId}
        rideId={rideId}
        visible={Boolean(activePostId)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  headerText: { flex: 1, gap: spacing.xs },
  nextLabel: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  code: { fontWeight: '800', letterSpacing: 1 },
  // Cancels ScrollScreen's horizontal padding so feed photos run edge-to-edge.
  feed: { marginHorizontal: -spacing.lg },
});
