import Ionicons from '@expo/vector-icons/Ionicons';
import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { ChallengeHatIcon } from '@/components/challenge-hat-icon';
import {
  Body,
  PostImage,
  RideFeedSkeleton,
  StatePanel,
} from '@/components/ui';
import {
  formatChallengeRemaining,
  useChallengePosts,
  useRideChallenge,
} from '@/features/challenges';
import {
  compareChallengeEntries,
  formatProfileName,
  getReactionScoreSum,
  reactionEmojiForScore,
  useSignedPostImage,
  type PostRecord,
} from '@/features/posts';
import { usePostingStatus } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type ChallengeTab = 'entries' | 'info';

const TABS = [
  { id: 'entries' as const, label: 'Entries' },
  { id: 'info' as const, label: 'Info' },
];

function formatChallengeMoment(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChallengeEntryPhoto({
  post,
  locked,
}: {
  post: PostRecord;
  locked: boolean;
}) {
  const author = formatProfileName(post.profile);
  const image = useSignedPostImage(post.image_path);

  if (locked) {
    return <PostImage aspectRatio={1} locked post={post} />;
  }

  if (image.isPending) {
    return <View style={styles.entryPhotoPlaceholder} />;
  }

  if (!image.data?.url) {
    return (
      <View style={styles.entryPhotoPlaceholder}>
        <Body muted>Unavailable</Body>
      </View>
    );
  }

  return (
    <ExpoImage
      accessibilityLabel={`Photo by ${author}`}
      cachePolicy="memory-disk"
      contentFit="cover"
      recyclingKey={post.image_path}
      source={{ uri: image.data.url, cacheKey: post.image_path }}
      style={StyleSheet.absoluteFill}
    />
  );
}

function ChallengeEntryTile({
  post,
  isLeader,
  mediaLocked,
}: {
  post: PostRecord;
  isLeader: boolean;
  mediaLocked: boolean;
}) {
  const author = formatProfileName(post.profile);
  const likeScore = getReactionScoreSum(post);
  const likeEmoji = reactionEmojiForScore(likeScore === 0 ? 0 : likeScore > 0 ? 1 : -1);

  return (
    <View style={styles.entryTile}>
      <View style={styles.entryPhotoWrap}>
        <ChallengeEntryPhoto locked={mediaLocked} post={post} />
        {isLeader ? (
          <View pointerEvents="none" style={styles.leaderBadge}>
            <ChallengeHatIcon color={colors.white} size={12} />
          </View>
        ) : null}
      </View>
      <View style={styles.entryMeta}>
        <Text numberOfLines={1} style={styles.entryAuthor}>
          {author}
        </Text>
        <View
          accessibilityLabel={`Like score ${likeScore}`}
          style={styles.entryLikes}
        >
          <Text style={styles.entryLikeEmoji}>{likeEmoji ?? '👍'}</Text>
          <Text style={styles.entryLikeCount}>{likeScore}</Text>
        </View>
      </View>
    </View>
  );
}

export default function RideChallengeScreen() {
  const { rideId, rideChallengeId } = useLocalSearchParams<{
    rideId: string;
    rideChallengeId: string;
  }>();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { user } = useCurrentUser();
  const challenge = useRideChallenge(rideChallengeId);
  const posts = useChallengePosts(rideChallengeId);
  const posting = usePostingStatus(rideId, user?.id);
  const [tab, setTab] = useState<ChallengeTab>('entries');
  const [refreshing, setRefreshing] = useState(false);

  const title = challenge.data?.challenge?.title ?? 'Challenge';

  useEffect(() => {
    navigation.setOptions({ title: 'Challenge' });
  }, [navigation]);

  const isActive =
    challenge.data != null && new Date(challenge.data.ends_at).getTime() > Date.now();
  const mediaLocked =
    !posting.isPending &&
    !posting.isArchived &&
    posting.isRequiredToday &&
    !posting.hasPosted;

  const sortedPosts = useMemo(() => {
    const list = posts.data ? [...posts.data] : [];
    list.sort(compareChallengeEntries);
    return list;
  }, [posts.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([challenge.refetch(), posts.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const openCamera = () => {
    router.push({ pathname: '/camera', params: { rideId } });
  };

  if (challenge.isPending) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
        <View style={[styles.pending, { paddingTop: headerHeight + spacing.md }]}>
          <RideFeedSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (challenge.isError || !challenge.data) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
        <View style={{ paddingTop: headerHeight + spacing.md }}>
          <StatePanel
            actionLabel="Try again"
            message={
              challenge.error instanceof Error
                ? challenge.error.message
                : 'This challenge could not load.'
            }
            onAction={() => void challenge.refetch()}
            title="Couldn’t open challenge"
          />
        </View>
      </SafeAreaView>
    );
  }

  const data = challenge.data;
  const timeLabel = formatChallengeRemaining(data.ends_at);
  const topScore = sortedPosts[0] ? getReactionScoreSum(sortedPosts[0]) : 0;
  const description = data.challenge?.description?.trim() ?? '';

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + spacing.md },
        ]}
        refreshControl={
          <RefreshControl
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.heroShadow}>
          <LinearGradient
            colors={[colors.primary, '#FF8A45', '#F6B35A']}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <View style={styles.hatWrap}>
                <ChallengeHatIcon color={colors.white} size={22} />
              </View>
              <View style={styles.heroTime}>
                <Ionicons color="rgba(255,255,255,0.92)" name="time-outline" size={14} />
                <Text style={styles.heroTimeText}>{timeLabel}</Text>
              </View>
            </View>

            <Text style={styles.eyebrow}>
              {isActive ? 'PHOTO CHALLENGE' : 'PAST CHALLENGE'}
            </Text>
            <Text style={styles.title}>{title.toUpperCase()}</Text>
            {description ? (
              <Text style={styles.heroDescription}>{description}</Text>
            ) : null}
          </LinearGradient>
        </View>

        {isActive && !data.current_user_completed ? (
          <Pressable
            accessibilityRole="button"
            onPress={openCamera}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Ionicons color={colors.white} name="camera" size={20} />
            <Text style={styles.ctaText}>Take your challenge photo</Text>
          </Pressable>
        ) : null}

        <View style={styles.tabBar}>
          <SegmentedControl
            appearance="light"
            onValueChange={(value) => {
              const item = TABS.find((tabItem) => tabItem.label === value);
              if (!item) return;
              haptics.selection();
              setTab(item.id);
            }}
            selectedIndex={Math.max(
              0,
              TABS.findIndex((item) => item.id === tab),
            )}
            style={styles.segmented}
            tintColor={colors.primary}
            values={TABS.map((item) => item.label)}
          />
        </View>

        {tab === 'entries' ? (
          <View style={styles.tabBody}>
            {posts.isPending ? (
              <RideFeedSkeleton />
            ) : posts.isError ? (
              <StatePanel
                actionLabel="Try again"
                message={
                  posts.error instanceof Error
                    ? posts.error.message
                    : 'Challenge posts could not load.'
                }
                onAction={() => void posts.refetch()}
                title="Couldn’t load posts"
              />
            ) : sortedPosts.length > 0 ? (
              <View style={styles.grid}>
                {sortedPosts.map((post, index) => (
                  <ChallengeEntryTile
                    key={post.id}
                    isLeader={index === 0 && topScore > 0}
                    mediaLocked={mediaLocked}
                    post={post}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyPosts}>
                <ChallengeHatIcon color={colors.muted} size={24} />
                <Body muted>Challenge posts will show up here.</Body>
              </View>
            )}

            {posts.isFetching && !posts.isPending ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
            ) : null}
          </View>
        ) : (
          <View style={styles.tabBody}>
            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons color={colors.primary} name="calendar-outline" size={18} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>Starts</Text>
                  <Text style={styles.infoValue}>{formatChallengeMoment(data.starts_at)}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons color={colors.primary} name="time-outline" size={18} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>Ends</Text>
                  <Text style={styles.infoValue}>{formatChallengeMoment(data.ends_at)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  pending: { paddingHorizontal: spacing.lg },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  heroShadow: {
    borderRadius: radius.xl,
    ...shadows.challenge,
  },
  hero: {
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.xs,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  hatWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  heroTime: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroTimeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 34,
  },
  heroDescription: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.glow,
  },
  ctaPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  ctaText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  tabBar: {
    width: '100%',
  },
  segmented: {
    height: 36,
    width: '100%',
  },
  tabBody: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  entryTile: {
    gap: spacing.xs,
    width: '48%',
  },
  entryPhotoWrap: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  entryPhotoPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  leaderBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
    ...shadows.glow,
  },
  entryMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  entryAuthor: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  entryLikes: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  entryLikeEmoji: {
    fontSize: 14,
    lineHeight: 16,
  },
  entryLikeCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyPosts: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  infoList: {
    gap: spacing.md,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  infoCopy: { flex: 1, gap: 2 },
  infoLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
