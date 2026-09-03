import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { CommentsModal } from '@/components/comments-modal';
import { ReactionsModal } from '@/components/reactions-modal';
import { SheetCloseButton } from '@/components/sheet-close-button';
import { Body, FeedPost, RideFeedSkeleton, StatePanel } from '@/components/ui';
import {
  getOwnReactionScore,
  useDeletePost,
  useRemoveReaction,
  useRidePostDates,
  useRidePostsForDate,
  useUpsertReaction,
  type PostRecord,
} from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

function monthKeyFromDate(isoDate: string) {
  return isoDate.slice(0, 7);
}

function formatDayHeading(isoDate: string) {
  try {
    return format(parseISO(isoDate), 'EEEE, MMM d, yyyy');
  } catch {
    return isoDate;
  }
}

function DayFeedScreen({
  date,
  rideId,
  onClose,
}: {
  date: string;
  rideId: string;
  onClose: () => void;
}) {
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [reactionsPostId, setReactionsPostId] = useState<string | null>(null);
  const [pickerPostId, setPickerPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const deletePost = useDeletePost();
  const upsertReaction = useUpsertReaction();
  const removeReaction = useRemoveReaction();
  const dayPosts = useRidePostsForDate(rideId, date);

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

  const handleSelectReaction = (postId: string, score: number) => {
    const post = dayPosts.data?.find((item) => item.id === postId);
    const ownScore = post ? getOwnReactionScore(post, user?.id) : null;
    setPickerPostId(null);

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
    void upsertReaction.mutateAsync({ postId, rideId, score }).catch((error) => {
      haptics.error();
      Alert.alert(
        'Couldn’t save reaction',
        error instanceof Error ? error.message : 'The reaction could not be saved.',
      );
    });
  };

  return (
    <View style={styles.feedRoot}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.feedHeaderSafe}>
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>{formatDayHeading(date)}</Text>
          <SheetCloseButton accessibilityLabel="Close day photos" onPress={onClose} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={[
          styles.feedContent,
          { paddingBottom: spacing.xl + insets.bottom },
        ]}
        style={styles.feedScroll}
      >
        {dayPosts.isPending ? (
          <RideFeedSkeleton count={2} />
        ) : dayPosts.isError ? (
          <View style={styles.feedMessage}>
            <StatePanel
              actionLabel="Retry"
              message="Photos for this day could not load."
              onAction={() => void dayPosts.refetch()}
            />
          </View>
        ) : dayPosts.data?.length ? (
          dayPosts.data.map((post: PostRecord) => (
            <FeedPost
              key={post.id}
              deleting={deletingPostId === post.id}
              isOwnPost={post.user_id === user?.id}
              onCloseReactionPicker={() => setPickerPostId(null)}
              onDelete={() => confirmDeletePost(post.id)}
              onDoubleTapImage={() => {
                haptics.light();
                setPickerPostId(post.id);
              }}
              onPress={() => setActivePostId(post.id)}
              onPressReactions={() => setReactionsPostId(post.id)}
              onSelectReaction={(score) => handleSelectReaction(post.id, score)}
              ownReactionScore={getOwnReactionScore(post, user?.id)}
              post={post}
              reactionPickerVisible={pickerPostId === post.id}
            />
          ))
        ) : (
          <View style={styles.feedMessage}>
            <Body muted>No photos on this day.</Body>
          </View>
        )}
      </ScrollView>

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
    </View>
  );
}

export function RideHistoryCalendar({ rideId }: { rideId: string }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [visibleMonth, setVisibleMonth] = useState(() => monthKeyFromDate(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const postDates = useRidePostDates(rideId, visibleMonth);
  const feedOpen = Boolean(selectedDate);

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      {
        marked?: boolean;
        dotColor?: string;
      }
    > = {};

    for (const date of postDates.data ?? []) {
      marks[date] = {
        marked: true,
        dotColor: colors.accent,
      };
    }

    return marks;
  }, [postDates.data]);

  const closeDayFeed = () => {
    setSelectedDate(null);
  };

  const onDayPress = (day: DateData) => {
    haptics.selection();
    setSelectedDate(day.dateString);
  };

  return (
    <View style={styles.wrap}>
      <Calendar
        current={today}
        enableSwipeMonths
        markedDates={markedDates}
        markingType="dot"
        onDayPress={onDayPress}
        onMonthChange={(month) => {
          setVisibleMonth(
            `${month.year}-${String(month.month).padStart(2, '0')}`,
          );
        }}
        theme={{
          backgroundColor: 'transparent',
          calendarBackground: 'transparent',
          textSectionTitleColor: colors.muted,
          selectedDayBackgroundColor: colors.primarySoft,
          selectedDayTextColor: colors.primary,
          todayTextColor: colors.accent,
          dayTextColor: colors.text,
          textDisabledColor: colors.borderStrong,
          monthTextColor: colors.text,
          arrowColor: colors.primary,
          textDayFontWeight: '600',
          textMonthFontWeight: '800',
          textDayHeaderFontWeight: '700',
          dotColor: colors.accent,
          selectedDotColor: colors.accent,
        }}
        style={styles.calendar}
      />

      {postDates.isError ? (
        <StatePanel
          actionLabel="Retry"
          message="Could not load days with photos."
          onAction={() => void postDates.refetch()}
        />
      ) : (
        <Body muted>Days with a blue dot have photos. Tap a day to open them.</Body>
      )}

      <Modal
        animationType="slide"
        onRequestClose={closeDayFeed}
        presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
        statusBarTranslucent
        visible={feedOpen}
      >
        {/* Full-screen Modal needs its own SafeAreaProvider for correct insets. */}
        <SafeAreaProvider>
          {selectedDate ? (
            <DayFeedScreen
              date={selectedDate}
              onClose={closeDayFeed}
              rideId={rideId}
            />
          ) : null}
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  calendar: {
    backgroundColor: 'transparent',
  },
  feedRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  feedHeaderSafe: {
    backgroundColor: colors.background,
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  feedTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  feedScroll: { flex: 1 },
  // Match the main Ride feed side inset so photos aren't edge-to-edge.
  feedContent: {
    paddingHorizontal: spacing.md,
    paddingTop: 0,
  },
  feedMessage: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
