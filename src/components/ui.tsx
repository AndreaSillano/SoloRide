import { useHeaderHeight } from 'expo-router/react-navigation';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren, ReactElement, ReactNode, RefObject } from 'react';
import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableProps,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  View,
} from 'react-native';import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { WEEKDAYS, WEEKDAY_SHORT_LABELS } from '@/features/rides';
import { formatChallengeRemaining, isChallengeEnded } from '@/features/challenges';
import {
  getCommentCount,
  formatProfileName,
  getReactionCount,
  getReactionScoreSum,
  reactionEmojiForScore,
  POST_IMAGE_ASPECT_RATIO,
  useSignedPostImage,
  type PostRecord,
} from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { ChallengeHatIcon } from '@/components/challenge-hat-icon';
import { colors, radius, shadows, spacing } from '@/theme';

import { GlassIconButton, GlassSurface } from './glass';
import { ReactionBurst } from './reaction-burst';
import { FeedAudioNote } from './feed-audio-note';
import { FeedVideoPlay } from './feed-video-play';
import {
  clampReactionScore,
  reactionScoreFromSwipe,
  ScalePicker,
} from './scale-picker';

type AvatarProfile =
  | {
      display_name?: string | null;
      username?: string | null;
      avatar_url?: string | null;
    }
  | null
  | undefined;

// Native tab screens (expo-router/unstable-native-tabs) render without a React
// Navigation header, so there's no HeaderHeightContext to read from and the real
// useHeaderHeight() throws. Fall back to 0 in that case instead of crashing.
function useSafeHeaderHeight() {
  try {
    return useHeaderHeight();
  } catch {
    return 0;
  }
}

/** Extra room above the keyboard so fields aren't flush against it. */
const KEYBOARD_CLEARANCE = spacing.lg; 

export function Screen({
  children,
  centered = false,
}: PropsWithChildren<{ centered?: boolean; keyboardVerticalOffset?: number }>) {
  const headerHeight = useSafeHeaderHeight();
  const insets = useSafeAreaInsets();
  const edges: Edge[] = headerHeight > 0 ? ['left', 'right'] : ['top', 'left', 'right'];
  // Offset the ScrollView frame itself (not just content padding) so taps in the
  // transparent Stack header band reach the back button instead of this view.
  const headerOffset = headerHeight > 0 ? headerHeight + spacing.xxs : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={edges} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.screen,
            { paddingBottom: spacing.xxl + insets.bottom },
            centered && styles.centered,
          ]}
          contentInset={{ bottom: KEYBOARD_CLEARANCE }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: KEYBOARD_CLEARANCE }}
          style={[styles.flex, headerOffset > 0 && { marginTop: headerOffset }]}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function ScrollScreen({
  children,
  contentStyle,
  onScroll,
  refreshControl,
}: PropsWithChildren<{
  contentStyle?: StyleProp<import('react-native').ViewStyle>;
  keyboardVerticalOffset?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
}>) {
  const headerHeight = useSafeHeaderHeight();
  const insets = useSafeAreaInsets();
  const edges: Edge[] = headerHeight > 0 ? ['left', 'right'] : ['top', 'left', 'right'];
  // Offset the ScrollView frame itself (not just content padding) so taps in the
  // transparent Stack header band reach the back button instead of this view.
  const headerOffset = headerHeight > 0 ? headerHeight + spacing.xxs : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={edges} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: spacing.lg + insets.bottom },
            contentStyle,
          ]}
          contentInset={{ bottom: KEYBOARD_CLEARANCE }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          refreshControl={refreshControl}
          scrollEventThrottle={onScroll ? 16 : undefined}
          scrollIndicatorInsets={{ bottom: KEYBOARD_CLEARANCE }}
          style={[styles.flex, headerOffset > 0 && { marginTop: headerOffset }]}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function FixedHeaderScreen({
  header,
  children,
  contentStyle,
  overlay,
  refreshControl,
  onScroll,
  scrollEnabled = true,
  scrollRef,
}: PropsWithChildren<{
  header: ReactNode;
  contentStyle?: StyleProp<import('react-native').ViewStyle>;
  /** Rendered above the ScrollView, e.g. a floating action button that
   * should stay fixed to the screen instead of scrolling with content. */
  overlay?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** When false, locks the posts layer (empty states). */
  scrollEnabled?: boolean;
  /** Lets parents scroll to a feed post (e.g. comment push deep link). */
  scrollRef?: RefObject<ScrollView | null>;
}>) {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, Math.max(headerHeight, 1)],
    outputRange: [0, -Math.max(headerHeight, 1)],
    extrapolate: 'clamp',
  });

  const handleScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          onScrollRef.current?.(event);
        },
      }),
    [scrollY],
  );

  const refresh =
    scrollEnabled && refreshControl && headerHeight > 0
      ? cloneElement(refreshControl, { progressViewOffset: headerHeight })
      : scrollEnabled
        ? refreshControl
        : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
        {/* Posts-only scroll: pull-to-refresh moves this layer; header stays put. */}
        <Animated.ScrollView
          ref={scrollRef}
          automaticallyAdjustContentInsets={false}
          bounces={scrollEnabled}
          contentContainerStyle={[
            styles.feedScrollContent,
            {
              paddingBottom: spacing.lg + insets.bottom,
              paddingTop: headerHeight,
            },
            !scrollEnabled && styles.feedScrollContentLocked,
            contentStyle,
          ]}
          contentInset={{ bottom: KEYBOARD_CLEARANCE }}
          // Prevent iOS from adding a second top inset on top of paddingTop.
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          overScrollMode={scrollEnabled ? 'auto' : 'never'}
          refreshControl={refresh}
          removeClippedSubviews={false}
          scrollEnabled={scrollEnabled}
          scrollEventThrottle={16}
          scrollIndicatorInsets={{ bottom: KEYBOARD_CLEARANCE, top: headerHeight }}
          showsVerticalScrollIndicator={false}
          style={styles.flex}
        >
          {children}
        </Animated.ScrollView>

        {/* Collapses on scroll-down; clamped so overscroll/pull-to-refresh leaves it sticky. */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.collapsingHeader,
            { transform: [{ translateY: headerTranslateY }] },
          ]}
        >
          {/* Behind header chrome so ride/create menus stay tappable. */}
          {overlay}
          <View
            onLayout={(event) => {
              const next = Math.ceil(event.nativeEvent.layout.height);
              setHeaderHeight((current) => (current === next ? current : next));
            }}
            style={[styles.collapsingHeaderInner, { paddingTop: insets.top }]}
          >
            {header}
          </View>
        </Animated.View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <GlassSurface style={styles.card}>{children}</GlassSurface>;
}

export function AppMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 64 : 96;
  const corner = compact ? radius.md : radius.lg;
  return (
    <View style={[styles.appMark, { borderRadius: corner, height: size, width: size }]}>
      <Image
        accessibilityLabel="Rhodeo"
        source={require('../../assets/Rhodeo-icon.png')}
        style={{ borderRadius: corner, height: size, width: size }}
      />
    </View>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Heading({
  children,
  numberOfLines,
}: PropsWithChildren<{ numberOfLines?: number }>) {
  return (
    <Text ellipsizeMode="tail" numberOfLines={numberOfLines} style={styles.heading}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
}: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Field({
  label,
  error,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: TextInputProps & { label?: string; error?: string }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <GlassSurface
        style={[
          styles.inputGlass,
          focused && styles.inputGlassFocused,
          error && styles.inputGlassError,
        ]}
      >
        <TextInput
          autoCapitalize="none"
          placeholderTextColor={colors.muted}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          selectionColor={colors.accent}
          style={[styles.input, style]}
          {...inputProps}
        />
      </GlassSurface>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  children,
  loading = false,
  variant = 'primary',
  compact = false,
  disabled,
  ...pressableProps
}: PressableProps & {
  children: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  compact?: boolean;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'accent' && styles.buttonAccent,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? colors.primary : colors.white}
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            compact && styles.buttonTextCompact,
            variant === 'secondary' && styles.buttonTextSecondary,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  return message ? (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.error}>{message}</Text>
    </View>
  ) : null;
}

export function StatePanel({
  title,
  message,
  loading = false,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title?: string;
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  const hasPrimary = Boolean(actionLabel && onAction);
  const hasSecondary = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <View style={styles.statePanel}>
      {loading ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      <Text style={[styles.body, styles.muted, styles.stateMessage]}>{message}</Text>
      {hasPrimary || hasSecondary ? (
        <View style={styles.stateActions}>
          {hasPrimary ? (
            <Button variant="secondary" onPress={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {hasSecondary ? (
            <Button variant="secondary" onPress={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Soft shimmer placeholder — use to sketch layouts while data loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift]);

  const translateX = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 180],
  });

  return (
    <View style={[styles.skeleton, style]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.skeletonShimmer, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0)',
          ]}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={styles.skeletonShimmerFill}
        />
      </Animated.View>
    </View>
  );
}

/** Centered loading copy without a card/panel chrome. */
export function CenteredBusy({ message }: { message: string }) {
  return (
    <View style={styles.centeredBusy}>
      <Skeleton style={styles.centeredBusyPulse} />
      <Text style={styles.centeredBusyText}>{message}</Text>
    </View>
  );
}

/** Feed-shaped skeleton for ride / photo loading states. */
export function RideFeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.rideSkeleton}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.feedItem}>
          <View style={styles.skeletonPost}>
            <View style={styles.skeletonPostHeader}>
              <Skeleton style={styles.skeletonAvatar} />
              <View style={styles.skeletonPostHeaderCopy}>
                <Skeleton style={styles.skeletonLineShort} />
                <Skeleton style={styles.skeletonLineTiny} />
              </View>
            </View>
            <Skeleton style={styles.skeletonImage} />
            <View style={styles.skeletonPostFooter}>
              <Skeleton style={styles.skeletonLineCaption} />
              <Skeleton style={styles.skeletonAction} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Compact comment-row skeletons for the comments sheet. */
export function CommentsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.commentsSkeleton}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.commentSkeletonRow}>
          <Skeleton style={styles.skeletonAvatar} />
          <View style={styles.commentSkeletonCopy}>
            <Skeleton style={styles.skeletonLineShort} />
            <Skeleton style={styles.skeletonLineCaption} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function WeekdaySelector({
  value,
  onChange,
  disabled = false,
  single = false,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  /** When true, tapping a day replaces the selection (monthly weekday). */
  single?: boolean;
}) {
  return (
    <View style={styles.weekdays}>
      {WEEKDAYS.map((day) => {
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (single) {
                onChange([day]);
                return;
              }
              onChange(
                selected
                  ? value.filter((candidate) => candidate !== day)
                  : [...value, day].sort((a, b) => a - b),
              );
            }}
            style={({ pressed }) => [
              styles.weekday,
              selected && styles.weekdaySelected,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
              {WEEKDAY_SHORT_LABELS[day]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ profile, size = 34 }: { profile?: AvatarProfile; size?: number }) {
  const name = formatProfileName(profile, '');
  const initials = name.trim().slice(0, 2).toUpperCase() || '?';
  const dimensions = { borderRadius: size / 2, height: size, width: size };

  if (profile?.avatar_url) {
    return (
      <Image
        accessibilityLabel={`${name || 'Member'}'s avatar`}
        source={{ uri: profile.avatar_url }}
        style={[styles.avatarImage, dimensions]}
      />
    );
  }

  return (
    <View style={[styles.avatarFallback, dimensions]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

export function PostImage({
  post,
  aspectRatio = POST_IMAGE_ASPECT_RATIO,
  style,
  locked = false,
}: {
  post: PostRecord;
  aspectRatio?: number;
  style?: StyleProp<ImageStyle>;
  /** Spoiler blur when the viewer still owes a required photo today. */
  locked?: boolean;
}) {
  const image = useSignedPostImage(post.image_path);
  const author = formatProfileName(post.profile);

  if (image.isPending) {
    return (
      <View style={[styles.photo, { aspectRatio }, styles.photoFrame, style]}>
        <Skeleton style={styles.photoSkeleton} />
      </View>
    );
  }
  if (!image.data?.url) {
    return (
      <View style={[styles.photo, { aspectRatio }, styles.photoLoading, style]}>
        <Body muted>Photo unavailable</Body>
      </View>
    );
  }

  const source = { uri: image.data.url, cacheKey: post.image_path };

  if (locked) {
    return (
      <View style={[styles.photo, { aspectRatio }, styles.photoFrame, style]}>
        {/* Extra scale + stacked blur so the subject is fully unreadable. */}
        <ExpoImage
          accessibilityElementsHidden
          blurRadius={80}
          cachePolicy="memory-disk"
          contentFit="cover"
          importantForAccessibility="no"
          recyclingKey={`${post.image_path}-locked-base`}
          source={source}
          style={styles.photoLockedFill}
        />
        <ExpoImage
          accessibilityLabel={`Blurred photo by ${author}`}
          blurRadius={80}
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={`${post.image_path}-locked`}
          source={source}
          style={styles.photoLockedFill}
        />
        <View pointerEvents="none" style={styles.photoLockedDim} />
      </View>
    );
  }

  return (
    <View style={[styles.photo, { aspectRatio }, styles.photoFrame, style]}>
      {/* Soft blurred fill for letterbox sides when the photo doesn't match frame. */}
      <ExpoImage
        accessibilityElementsHidden
        blurRadius={48}
        cachePolicy="memory-disk"
        contentFit="cover"
        importantForAccessibility="no"
        recyclingKey={`${post.image_path}-blur`}
        source={source}
        style={styles.photoBlurFill}
      />
      <ExpoImage
        accessibilityLabel={`Photo by ${author}`}
        cachePolicy="memory-disk"
        contentFit="contain"
        recyclingKey={post.image_path}
        source={source}
        style={styles.photoSharp}
        transition={150}
      />
    </View>
  );
}

function formatFeedTimestamp(isoDate: string) {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatRemainingTime(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return null;
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMinutes < 60) return `${remainingMinutes}m left`;
  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `${remainingHours}h left`;
}

/** Native overflow menu for a post (Report stub — wire later). */
function openPostOverflowMenu() {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Report'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      () => {
        // Report action intentionally not implemented yet.
      },
    );
    return;
  }

  Alert.alert('', '', [
    { text: 'Report', style: 'destructive', onPress: () => {} },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function FeedPost({
  post,
  onPress,
  onDoubleTapImage,
  onPressReactions,
  onSelectReaction,
  onCloseReactionPicker,
  reactionPickerVisible = false,
  ownReactionScore = null,
  isOwnPost = false,
  onDelete,
  deleting = false,
  mediaLocked = false,
  onPressLockedMedia,
  onPressChallenge,
}: {
  post: PostRecord;
  onPress: () => void;
  /** Double-tap or long-press the photo: open the reaction scale picker. */
  onDoubleTapImage?: () => void;
  /** Opens the full reaction list modal. */
  onPressReactions?: () => void;
  onSelectReaction?: (score: number) => void;
  onCloseReactionPicker?: () => void;
  reactionPickerVisible?: boolean;
  /** Current user's score on this post, if any. */
  ownReactionScore?: number | null;
  /** Whether the signed-in user authored this post; shows the delete icon. */
  isOwnPost?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  /** Blur photos and block reactions/video until the viewer posts today's required photo. */
  mediaLocked?: boolean;
  /** Tap blurred photo → typically Camera tab. */
  onPressLockedMedia?: () => void;
  /** Opens the challenge detail screen from the challenge chrome. */
  onPressChallenge?: () => void;
}) {
  const isChallenge = Boolean(post.ride_challenge_id);
  const challengeTitle =
    post.ride_challenge?.challenge?.title?.trim() || 'Challenge';
  const challengeEndsAt = post.ride_challenge?.ends_at ?? null;
  const challengeEnded =
    Boolean(post.ride_challenge_id) && isChallengeEnded(challengeEndsAt);
  /** Block new reactions (cadence lock or finished challenge). Photos stay visible when only challengeEnded. */
  const reactionsLocked = mediaLocked || challengeEnded;
  const challengeTimeLeft = challengeEndsAt
    ? formatChallengeRemaining(challengeEndsAt)
    : null;
  const author = formatProfileName(post.profile);
  const commentCount = getCommentCount(post);
  const reactionCount = getReactionCount(post);
  const reactionSum = getReactionScoreSum(post);
  const remaining = formatRemainingTime(post.expires_at);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const holdStartScoreRef = useRef(0);
  const holdScoreRef = useRef(0);
  const ownScoreRef = useRef(ownReactionScore);
  const openPickerRef = useRef(reactionsLocked ? undefined : onDoubleTapImage);
  const selectRef = useRef(reactionsLocked ? undefined : onSelectReaction);
  const closePickerRef = useRef(onCloseReactionPicker);
  const pickerVisibleRef = useRef(reactionPickerVisible);
  const [holdPreviewScore, setHoldPreviewScore] = useState<number | null>(null);
  const [burstScore, setBurstScore] = useState<number | null>(null);
  const [bottomActionsHeight, setBottomActionsHeight] = useState(0);
  /** Second tap must land within this window to count as a double-tap. */
  const DOUBLE_TAP_MS = 350;
  /** Slightly longer than the double-tap window so a late second tap still wins. */
  const SINGLE_TAP_DELAY_MS = 370;
  const LONG_PRESS_MS = 380;
  const MOVE_CANCEL_PX = 12;

  ownScoreRef.current = ownReactionScore;
  openPickerRef.current = reactionsLocked ? undefined : onDoubleTapImage;
  selectRef.current = reactionsLocked ? undefined : onSelectReaction;
  closePickerRef.current = onCloseReactionPicker;
  pickerVisibleRef.current = reactionPickerVisible;

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const clearSingleTapTimer = () => {
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearSingleTapTimer();
      clearLongPressTimer();
    };
  }, []);

  useEffect(() => {
    if (!reactionPickerVisible && holdPreviewScore != null && !holdActiveRef.current) {
      setHoldPreviewScore(null);
    }
  }, [holdPreviewScore, reactionPickerVisible]);

  const handlePickerSelect = (score: number) => {
    holdActiveRef.current = false;
    setHoldPreviewScore(null);
    onCloseReactionPicker?.();
    if (score !== 0) {
      setBurstScore(score);
    }
    onSelectReaction?.(score);
  };

  const photoPanResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture touches on the photo so a long-press can continue into a swipe
        // without lifting. Yield to the feed ScrollView until the hold activates.
        onStartShouldSetPanResponder: () => Boolean(openPickerRef.current),
        onPanResponderTerminationRequest: () => !holdActiveRef.current,
        onShouldBlockNativeResponder: () => holdActiveRef.current,
        onPanResponderGrant: () => {
          clearLongPressTimer();
          if (pickerVisibleRef.current && !holdActiveRef.current) {
            return;
          }
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            if (!openPickerRef.current) return;
            const start = clampReactionScore(ownScoreRef.current ?? 0);
            holdActiveRef.current = true;
            holdStartScoreRef.current = start;
            holdScoreRef.current = start;
            setHoldPreviewScore(start);
            clearSingleTapTimer();
            lastTapAt.current = 0;
            haptics.light();
            if (!pickerVisibleRef.current) {
              openPickerRef.current();
            }
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (_, gesture) => {
          if (!holdActiveRef.current) {
            if (Math.abs(gesture.dx) > MOVE_CANCEL_PX || Math.abs(gesture.dy) > MOVE_CANCEL_PX) {
              clearLongPressTimer();
            }
            return;
          }
          const next = reactionScoreFromSwipe(holdStartScoreRef.current, gesture.dx);
          if (next !== holdScoreRef.current) {
            holdScoreRef.current = next;
            setHoldPreviewScore(next);
            haptics.selection();
          }
        },
        onPanResponderRelease: () => {
          clearLongPressTimer();
          if (holdActiveRef.current) {
            const score = holdScoreRef.current;
            holdActiveRef.current = false;
            setHoldPreviewScore(null);
            closePickerRef.current?.();
            if (score !== 0) {
              setBurstScore(score);
            }
            selectRef.current?.(score);
            return;
          }

          if (pickerVisibleRef.current) {
            closePickerRef.current?.();
            return;
          }
          if (!openPickerRef.current) return;

          const now = Date.now();
          if (lastTapAt.current > 0 && now - lastTapAt.current < DOUBLE_TAP_MS) {
            clearSingleTapTimer();
            lastTapAt.current = 0;
            openPickerRef.current();
            return;
          }

          lastTapAt.current = now;
          clearSingleTapTimer();
          singleTapTimer.current = setTimeout(() => {
            singleTapTimer.current = null;
            lastTapAt.current = 0;
          }, SINGLE_TAP_DELAY_MS);
        },
        onPanResponderTerminate: () => {
          clearLongPressTimer();
          if (holdActiveRef.current) {
            holdActiveRef.current = false;
            setHoldPreviewScore(null);
            closePickerRef.current?.();
          }
        },
      }),
    [],
  );

  const reactionPicker =
    !reactionsLocked && onSelectReaction && onCloseReactionPicker ? (
      <ScalePicker
        interactive={holdPreviewScore == null}
        onClose={onCloseReactionPicker}
        onSelect={handlePickerSelect}
        selectedScore={holdPreviewScore ?? ownReactionScore}
        visible={reactionPickerVisible}
      />
    ) : null;

  // Render outside overflow:hidden photo wraps so the ±3 pop isn't clipped.
  const reactionBurst =
    !reactionsLocked && burstScore != null && burstScore !== 0 ? (
      <ReactionBurst score={burstScore} onFinished={() => setBurstScore(null)} />
    ) : null;

  const messageLabel =
    commentCount === 0
      ? 'Open comments'
      : commentCount === 1
        ? 'View 1 comment'
        : `View ${commentCount} comments`;

  const reactionStickerEmoji =
    reactionCount > 0 ? reactionEmojiForScore(reactionSum <= -1 ? -1 : 1) : null;

  // Estimate until onLayout measures — keeps audio clear of like/message on first paint.
  const FEED_SIDE_BUBBLE = 44;
  const FEED_SIDE_COUNT = 14;
  const showReactionAction = Boolean(onPressReactions);
  const estimatedActionsHeight =
    (showReactionAction ? FEED_SIDE_BUBBLE + (reactionCount > 0 ? FEED_SIDE_COUNT : 0) : 0) +
    (FEED_SIDE_BUBBLE + (commentCount > 0 ? FEED_SIDE_COUNT : 0)) +
    (showReactionAction ? spacing.sm : 0);
  const actionsHeight = bottomActionsHeight > 0 ? bottomActionsHeight : estimatedActionsHeight;
  const audioBottom =
    spacing.sm + actionsHeight + (actionsHeight > 0 ? spacing.sm : 0);

  const imageInner = (
    <>
      <View
        accessibilityHint={
          mediaLocked
            ? 'Opens the camera to post today\'s photo'
            : reactionsLocked
              ? undefined
              : 'Double-tap or long-press to react'
        }
        accessibilityLabel={mediaLocked ? 'Blurred photo. Post to unlock' : undefined}
        accessibilityRole="imagebutton"
      >
        <PostImage
          aspectRatio={POST_IMAGE_ASPECT_RATIO}
          locked={mediaLocked}
          post={post}
          style={styles.feedImage}
        />
      </View>
      {mediaLocked ? (
        <View pointerEvents="none" style={styles.feedLockedHint}>
          <View style={styles.feedLockedHintClip}>
            <GlassSurface dark style={styles.feedLockedHintPill}>
              <Ionicons color={colors.white} name="camera-outline" size={20} />
            </GlassSurface>
          </View>
        </View>
      ) : null}
      {!mediaLocked && post.video_path ? (
        <FeedVideoPlay durationMs={post.video_duration_ms} videoPath={post.video_path} />
      ) : null}

      <View pointerEvents="box-none" style={styles.feedOverlayTop}>
        <View pointerEvents="box-none" style={styles.feedOverlayTopRow}>
          <Avatar profile={post.profile} size={34} />
          <View style={styles.feedHeaderText}>
            <Text style={styles.feedOverlayAuthor}>{author}</Text>
            <Text style={styles.feedOverlayMeta}>
              {formatFeedTimestamp(post.created_at)}
              {post.is_temporary && remaining ? ` · ${remaining}` : ''}
            </Text>
          </View>
          <GlassIconButton
            accessibilityLabel="Post options"
            color={colors.white}
            dark
            icon="ellipsis-horizontal"
            iconSize={16}
            onPress={openPostOverflowMenu}
            size={32}
          />
          {isOwnPost && onDelete ? (
            deleting ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <GlassIconButton
                accessibilityLabel="Delete photo"
                color={colors.white}
                dark
                icon="trash-outline"
                iconSize={16}
                onPress={onDelete}
                size={32}
              />
            )
          ) : null}
        </View>
      </View>

      {!post.video_path && post.audio_path ? (
        <View
          pointerEvents="box-none"
          style={[styles.feedAudioSide, { bottom: audioBottom }]}
        >
          <FeedAudioNote audioPath={post.audio_path} />
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.feedOverlayBottom}>
        <View pointerEvents="box-none" style={styles.feedOverlayCopy}>
          {post.description ? (
            <Text numberOfLines={3} style={styles.feedOverlayCaption}>
              {post.description}
            </Text>
          ) : null}
          {post.location_name ? (
            <GlassSurface dark style={styles.feedLocationPill}>
              <Ionicons color={colors.primary} name="location-sharp" size={15} />
              <Text numberOfLines={1} style={styles.feedLocationPillText}>
                {post.location_name}
              </Text>
            </GlassSurface>
          ) : null}
        </View>
        <View
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setBottomActionsHeight((prev) => (prev === next ? prev : next));
          }}
          pointerEvents="box-none"
          style={styles.feedBottomActions}
        >
          {onPressReactions ? (
            <Pressable
              accessibilityLabel={
                reactionCount === 1
                  ? 'View 1 reaction'
                  : `View all ${reactionCount} reactions`
              }
              accessibilityRole="button"
              onPress={onPressReactions}
              style={({ pressed }) => [styles.feedSideAction, pressed && styles.pressed]}
            >
              <GlassSurface dark isInteractive style={styles.feedSideBubble}>
                <Text style={styles.feedSideEmoji}>
                  {reactionStickerEmoji ?? '👍'}
                </Text>
              </GlassSurface>
              {reactionCount > 0 ? (
                <Text style={styles.feedSideCount}>{reactionCount}</Text>
              ) : null}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={messageLabel}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [styles.feedSideAction, pressed && styles.pressed]}
          >
            <GlassSurface dark isInteractive style={styles.feedSideBubble}>
              <Ionicons color={colors.white} name="chatbubble-outline" size={18} />
            </GlassSurface>
            {commentCount > 0 ? (
              <Text style={styles.feedSideCount}>{commentCount}</Text>
            ) : null}
          </Pressable>
        </View>
      </View>

      {reactionPicker}
    </>
  );

  const challengeHeader = isChallenge ? (
    <Pressable
      accessibilityLabel={`Open challenge ${challengeTitle}`}
      accessibilityRole="button"
      disabled={!onPressChallenge}
      onPress={onPressChallenge}
      style={({ pressed }) => [
        styles.challengePostHeaderPress,
        pressed && onPressChallenge ? styles.pressed : null,
      ]}
    >
      <LinearGradient
        colors={[colors.primary, '#FF8A45', '#F6B35A']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.challengePostHeader}
      >
        <View style={styles.challengePostTrophy}>
          <ChallengeHatIcon color={colors.white} size={18} />
        </View>
        <View style={styles.challengePostHeaderCopy}>
          <Text numberOfLines={1} style={styles.challengePostTitle}>
            {challengeTitle}
          </Text>
          {challengeTimeLeft ? (
            <Text style={styles.challengePostTimeText}>{challengeTimeLeft}</Text>
          ) : null}
        </View>
        {onPressChallenge ? (
          <Ionicons color="rgba(255,255,255,0.92)" name="chevron-forward" size={16} />
        ) : null}
      </LinearGradient>
    </Pressable>
  ) : null;

  const photoBody = mediaLocked ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPressLockedMedia}
      style={[
        styles.feedImageWrap,
        isChallenge ? styles.feedImageWrapChallengeInner : null,
      ]}
    >
      {imageInner}
    </Pressable>
  ) : (
    <View
      style={[
        styles.feedImageWrap,
        isChallenge ? styles.feedImageWrapChallengeInner : null,
      ]}
      {...photoPanResponder.panHandlers}
    >
      {imageInner}
    </View>
  );

  return (
    <View style={styles.feedItem}>
      <View
        style={[
          styles.feedPhotoBlock,
          isChallenge ? styles.feedPhotoBlockChallenge : null,
        ]}
      >
        {isChallenge ? (
          <View style={styles.challengePostChrome}>
            {challengeHeader}
            {photoBody}
          </View>
        ) : (
          photoBody
        )}
        {reactionBurst}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1},
  collapsingHeader: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  collapsingHeaderInner: {
    position: 'relative',
    zIndex: 2,
  },
  /** Home feed: posts sit flush under the collapsing ride header. */
  feedScrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: 0,
  },
  feedScrollContentLocked: {
    flexGrow: 1,
  },
  screen: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxs,
  },
  scrollContent: {
    flexGrow: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xxs,
  },
  centered: { justifyContent: 'center' },
  card: {
    borderRadius: radius.lg,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
    ...shadows.card,
  },
  appMark: {
    overflow: 'hidden',
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heading: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 40,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginTop: spacing.sm,
  },
  body: { color: colors.textSoft, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted },
  field: { gap: spacing.xs },
  label: { color: colors.textSoft, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  inputGlass: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  inputGlassFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputGlassError: {
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  input: {
    backgroundColor: 'transparent',
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  errorBanner: {
    backgroundColor: colors.dangerSurface,
    borderColor: 'rgba(169, 66, 53, 0.15)',
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  statePanel: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  stateMessage: { textAlign: 'center' },
  stateActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  skeleton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  skeletonShimmer: {
    ...StyleSheet.absoluteFill,
    width: 120,
  },
  skeletonShimmerFill: {
    flex: 1,
  },
  centeredBusy: {
    alignItems: 'center',
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  centeredBusyPulse: {
    borderRadius: radius.pill,
    height: 10,
    width: 72,
  },
  centeredBusyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  rideSkeleton: {
    gap: spacing.md,
  },
  skeletonPost: {
    gap: spacing.sm,
  },
  skeletonPostHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  skeletonPostHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  skeletonAvatar: {
    borderRadius: radius.pill,
    height: 34,
    width: 34,
  },
  skeletonLineShort: {
    borderRadius: radius.pill,
    height: 12,
    width: '42%',
  },
  skeletonLineTiny: {
    borderRadius: radius.pill,
    height: 10,
    width: '28%',
  },
  skeletonLineCaption: {
    borderRadius: radius.pill,
    flex: 1,
    height: 12,
  },
  skeletonAction: {
    borderRadius: radius.pill,
    height: 36,
    width: 36,
  },
  skeletonPostFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  skeletonImage: {
    aspectRatio: POST_IMAGE_ASPECT_RATIO,
    borderRadius: radius.lg,
    width: '100%',
  },
  photoSkeleton: {
    ...StyleSheet.absoluteFill,
    borderRadius: 0,
  },
  commentsSkeleton: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  commentSkeletonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  commentSkeletonCopy: {
    flex: 1,
    gap: 8,
    paddingTop: 4,
  },
  weekdays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  weekday: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    flexBasis: '12%',
    minWidth: 36,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  weekdaySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekdayText: { color: colors.text, fontSize: 11, fontWeight: '600' },
  weekdayTextSelected: { color: colors.surface },
  photo: { backgroundColor: colors.surfaceMuted, width: '100%' },
  photoFrame: { overflow: 'hidden' },
  photoBlurFill: {
    ...StyleSheet.absoluteFill,
    transform: [{ scale: 1.08 }],
  },
  photoLockedFill: {
    ...StyleSheet.absoluteFill,
    transform: [{ scale: 1.35 }],
  },
  photoSharp: {
    ...StyleSheet.absoluteFill,
  },
  photoLockedDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  avatarImage: { backgroundColor: colors.surfaceMuted },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  avatarInitials: { color: colors.primary, fontWeight: '800' },
  feedItem: {
    overflow: 'visible',
    paddingBottom: spacing.md,
  },
  feedHeaderText: { flex: 1, gap: 1 },
  feedImage: { aspectRatio: POST_IMAGE_ASPECT_RATIO, width: '100%' },
  feedPhotoBlock: {
    overflow: 'visible',
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  feedPhotoBlockChallenge: {
    ...shadows.challenge,
  },
  challengePostChrome: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderRadius: radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  challengePostHeaderPress: {
    overflow: 'hidden',
  },
  challengePostHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 12,
  },
  challengePostTrophy: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  challengePostHeaderCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  challengePostTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  challengePostTimeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
  },
  feedImageWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    ...shadows.card,
  },
  feedImageWrapChallengeInner: {
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  feedLockedHint: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  feedLockedHintClip: {
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  feedLockedHintPill: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  feedLockedHintText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  feedOverlayTop: {
    left: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 6,
  },
  feedOverlayTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedAudioSide: {
    // `bottom` is set from the measured like/message stack height.
    position: 'absolute',
    right: spacing.sm,
    top: 52,
    zIndex: 6,
  },
  feedOverlayAuthor: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedOverlayMeta: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedBottomActions: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  feedSideAction: {
    alignItems: 'center',
    gap: 2,
  },
  feedSideBubble: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  feedSideEmoji: {
    fontSize: 18,
  },
  feedSideCount: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedOverlayBottom: {
    alignItems: 'flex-end',
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    left: 0,
    padding: spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 6,
  },
  feedOverlayCopy: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'flex-end',
    minWidth: 0,
    paddingRight: spacing.xs,
  },
  feedOverlayCaption: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedLocationPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  feedLocationPillText: {
    color: colors.white,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },

  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    ...shadows.glow,
  },
  buttonCompact: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonAccent: { backgroundColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  buttonTextCompact: { fontSize: 13, fontWeight: '700' },
  buttonTextSecondary: { color: colors.primary },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
