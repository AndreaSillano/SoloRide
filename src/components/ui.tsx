import { useHeaderHeight } from '@react-navigation/elements';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
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
import {
  getCommentCount,
  formatProfileName,
  getReactionCount,
  getReactionSummary,
  reactionScoreToSize,
  useSignedPostImage,
  type PostRecord,
} from '@/features/posts';
import { colors, radius, shadows, spacing } from '@/theme';

import { ReactionBurst } from './reaction-burst';
import { ScalePicker } from './scale-picker';

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={edges} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.screen,
            headerHeight > 0 && { paddingTop: headerHeight + spacing.xxs },
            { paddingBottom: spacing.xxl + insets.bottom },
            centered && styles.centered,
          ]}
          contentInset={{ bottom: KEYBOARD_CLEARANCE }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: KEYBOARD_CLEARANCE }}
          style={styles.flex}
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
}: PropsWithChildren<{
  contentStyle?: StyleProp<import('react-native').ViewStyle>;
  keyboardVerticalOffset?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}>) {
  const headerHeight = useSafeHeaderHeight();
  const insets = useSafeAreaInsets();
  const edges: Edge[] = headerHeight > 0 ? ['left', 'right'] : ['top', 'left', 'right'];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={edges} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            headerHeight > 0 && { paddingTop: headerHeight + spacing.xxs },
            { paddingBottom: spacing.lg + insets.bottom },
            contentStyle,
          ]}
          contentInset={{ bottom: KEYBOARD_CLEARANCE }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={onScroll ? 16 : undefined}
          scrollIndicatorInsets={{ bottom: KEYBOARD_CLEARANCE }}
          style={styles.flex}
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
}: PropsWithChildren<{
  header: ReactNode;
  contentStyle?: StyleProp<import('react-native').ViewStyle>;
  /** Rendered above the ScrollView, e.g. a floating action button that
   * should stay fixed to the screen instead of scrolling with content. */
  overlay?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}>) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Elevated above the ScrollView so absolutely-positioned dropdowns
            rendered inside `header` can overlay the scrolling content below. */}
        <View style={styles.fixedHeader}>{header}</View>
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
          style={styles.flex}
        >
          {children}
        </ScrollView>
        {overlay}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function AppMark({ compact = false }: { compact?: boolean }) {
  const size = compact ? 64 : 96;
  const corner = compact ? radius.md : radius.lg;
  return (
    <View style={[styles.appMark, { borderRadius: corner, height: size, width: size }]}>
      <Image
        accessibilityLabel="SoloRide"
        source={require('../../assets/icon.png')}
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
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style,
        ]}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  children,
  loading = false,
  variant = 'primary',
  disabled,
  ...pressableProps
}: PressableProps & {
  children: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'accent' && styles.buttonAccent,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.white} />
      ) : (
        <Text
          style={[
            styles.buttonText,
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
  return (
    <Card>
      {loading ? <ActivityIndicator color={colors.primary} size="large" /> : null}
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      <Body muted>{message}</Body>
      {actionLabel && onAction ? (
        <Button variant="secondary" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Button variant="secondary" onPress={onSecondaryAction}>
          {secondaryActionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

/** Soft pulsing placeholder block — use to sketch layouts while data loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}

/** Centered loading copy without a card/panel chrome. */
export function CenteredBusy({ message }: { message: string }) {
  return (
    <View style={styles.centeredBusy}>
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
          <View style={styles.feedHeader}>
            <Skeleton style={styles.skeletonAvatar} />
            <View style={styles.feedHeaderText}>
              <Skeleton style={styles.skeletonAuthor} />
              <Skeleton style={styles.skeletonMeta} />
            </View>
            <Skeleton style={styles.skeletonTime} />
          </View>
          <Skeleton style={styles.skeletonImage} />
          <View style={styles.feedActions}>
            <Skeleton style={styles.skeletonAction} />
          </View>
          <Skeleton style={styles.skeletonCaption} />
        </View>
      ))}
    </View>
  );
}

export function WeekdaySelector({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.weekdays}>
      {WEEKDAYS.map((day) => {
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() =>
              onChange(
                selected
                  ? value.filter((candidate) => candidate !== day)
                  : [...value, day].sort((a, b) => a - b),
              )
            }
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
  aspectRatio = 1,
  style,
}: {
  post: PostRecord;
  aspectRatio?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const image = useSignedPostImage(post.image_path);
  const author = formatProfileName(post.profile);

  if (image.isPending) {
    return (
      <View style={[styles.photo, { aspectRatio }, styles.photoLoading, style]}>
        <ActivityIndicator color={colors.primary} />
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

  return (
    <Image
      accessibilityLabel={`Photo by ${author}`}
      resizeMode="cover"
      source={{ uri: image.data.url }}
      style={[styles.photo, { aspectRatio }, style]}
    />
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
}: {
  post: PostRecord;
  onPress: () => void;
  /** Double-tap the photo: open the reaction scale picker. */
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
}) {
  const author = formatProfileName(post.profile);
  const commentCount = getCommentCount(post);
  const reactionCount = getReactionCount(post);
  const { scores: reactionSummary, hasMore: hasMoreReactions } = getReactionSummary(post);
  const remaining = formatRemainingTime(post.expires_at);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [burstScore, setBurstScore] = useState<number | null>(null);
  /** Second tap must land within this window to count as a double-tap. */
  const DOUBLE_TAP_MS = 350;
  /** Slightly longer than the double-tap window so a late second tap still wins. */
  const SINGLE_TAP_DELAY_MS = 370;

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  const handleImagePress = () => {
    if (reactionPickerVisible) {
      onCloseReactionPicker?.();
      return;
    }
    if (!onDoubleTapImage) return;

    const now = Date.now();
    if (lastTapAt.current > 0 && now - lastTapAt.current < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTapAt.current = 0;
      onDoubleTapImage();
      return;
    }

    // Single tap on the photo does nothing — comments open only from the
    // comment icon / "Add a comment" row.
    lastTapAt.current = now;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      lastTapAt.current = 0;
    }, SINGLE_TAP_DELAY_MS);
  };

  const handlePickerSelect = (score: number) => {
    onCloseReactionPicker?.();
    if (score !== 0) {
      setBurstScore(score);
    }
    onSelectReaction?.(score);
  };

  const reactionOverlay = (
    <>
      {onSelectReaction && onCloseReactionPicker ? (
        <ScalePicker
          onClose={onCloseReactionPicker}
          onSelect={handlePickerSelect}
          selectedScore={ownReactionScore}
          visible={reactionPickerVisible}
        />
      ) : null}
      {burstScore != null && burstScore !== 0 ? (
        <ReactionBurst score={burstScore} onFinished={() => setBurstScore(null)} />
      ) : null}
    </>
  );

  const summaryScores =
    reactionSummary.length > 0
      ? reactionSummary
      : ownReactionScore != null
        ? [ownReactionScore]
        : [];

  const actionsRow = (
    <View style={styles.feedActions}>
      <Pressable
        accessibilityLabel="View comments"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Ionicons color={colors.text} name="chatbubble-outline" size={23} />
      </Pressable>

      <View style={styles.feedActionsSpacer} />

      <Pressable
        accessibilityLabel={
          reactionCount === 0
            ? 'No reactions yet'
            : reactionCount === 1
              ? 'View 1 reaction'
              : `View all ${reactionCount} reactions`
        }
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPressReactions}
        style={({ pressed }) => [styles.feedReactions, pressed && styles.pressed]}
      >
        {summaryScores.length ? (
          <View style={styles.feedReactionStack}>
            {summaryScores.map((score, index) => {
              const size = reactionScoreToSize(score);
              return (
                <View
                  key={`${score}-${index}`}
                  style={[
                    styles.feedReactionIconWrap,
                    index > 0 ? styles.feedReactionOverlap : null,
                    { zIndex: index + 1 },
                  ]}
                >
                  <MaterialIcons
                    color={colors.text}
                    name={score > 0 ? 'thumb-up' : 'thumb-down'}
                    size={size}
                  />
                </View>
              );
            })}
            {hasMoreReactions ? (
              <Text
                style={[
                  styles.feedReactionMoreText,
                  styles.feedReactionOverlap,
                  { zIndex: summaryScores.length + 1 },
                ]}
              >
                +
              </Text>
            ) : null}
          </View>
        ) : (
          <MaterialIcons color={colors.muted} name="thumb-up-off-alt" size={24} />
        )}
      </Pressable>
    </View>
  );

  if (post.is_temporary) {
    return (
      <View style={styles.feedItemTemporary}>
        <View style={styles.tempPhotoWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={handleImagePress}
          >
            <PostImage aspectRatio={3 / 4} post={post} style={styles.tempPhoto} />
          </Pressable>
          <View style={styles.tempOverlay} pointerEvents="box-none">
            <Avatar profile={post.profile} size={34} />
            <View style={styles.feedHeaderText}>
              <Text style={styles.tempAuthor}>{author}</Text>
              {post.location_name ? (
                <Text style={styles.tempMeta} numberOfLines={1}>
                  ⌖ {post.location_name}
                </Text>
              ) : null}
            </View>
            {isOwnPost && onDelete ? (
              <Pressable
                accessibilityLabel="Delete photo"
                accessibilityRole="button"
                disabled={deleting}
                hitSlop={10}
                onPress={onDelete}
                style={({ pressed }) => [styles.feedDelete, pressed && styles.pressed]}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Ionicons color={colors.white} name="trash-outline" size={18} />
                )}
              </Pressable>
            ) : null}
          </View>
          {remaining ? (
            <View style={styles.tempTimerBadge} pointerEvents="none">
              <Text style={styles.tempTimerText}>{remaining}</Text>
            </View>
          ) : null}
          {reactionOverlay}
        </View>

        {actionsRow}

        {post.description ? (
          <Text style={styles.feedCaption}>
            <Text style={styles.feedAuthor}>{author} </Text>
            {post.description}
          </Text>
        ) : null}

        <Pressable accessibilityRole="button" onPress={onPress}>
          <Text style={styles.feedViewComments}>
            {commentCount === 0
              ? 'Add a comment'
              : commentCount === 1
                ? 'View 1 comment'
                : `View all ${commentCount} comments`}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.feedItem}>
      <View style={styles.feedHeader}>
        <Avatar profile={post.profile} size={34} />
        <View style={styles.feedHeaderText}>
          <Text style={styles.feedAuthor}>{author}</Text>
          {post.location_name ? (
            <Text style={styles.feedLocation} numberOfLines={1}>
              ⌖ {post.location_name}
            </Text>
          ) : null}
        </View>
        <Text style={styles.feedTime}>{formatFeedTimestamp(post.created_at)}</Text>
        {isOwnPost && onDelete ? (
          <Pressable
            accessibilityLabel="Delete photo"
            accessibilityRole="button"
            disabled={deleting}
            hitSlop={10}
            onPress={onDelete}
            style={({ pressed }) => [styles.feedDelete, pressed && styles.pressed]}
          >
            {deleting ? (
              <ActivityIndicator color={colors.muted} size="small" />
            ) : (
              <Ionicons color={colors.muted} name="trash-outline" size={18} />
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.feedImageWrap}>
        <Pressable
          accessibilityRole="button"
          onPress={handleImagePress}
        >
          <PostImage post={post} style={styles.feedImage} />
        </Pressable>
        {reactionOverlay}
      </View>

      {actionsRow}

      {post.description ? (
        <Text style={styles.feedCaption}>
          <Text style={styles.feedAuthor}>{author} </Text>
          {post.description}
        </Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text style={styles.feedViewComments}>
          {commentCount === 0
            ? 'Add a comment'
            : commentCount === 1
              ? 'View 1 comment'
              : `View all ${commentCount} comments`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1},
  fixedHeader: { position: 'relative', zIndex: 20 },
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
    backgroundColor: colors.surface,
    borderColor: 'rgba(222, 217, 205, 0.75)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
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
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  inputFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  errorBanner: {
    backgroundColor: colors.dangerSurface,
    borderColor: 'rgba(169, 66, 53, 0.15)',
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  skeleton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
  },
  centeredBusy: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  centeredBusyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  rideSkeleton: {
    marginHorizontal: -spacing.lg,
  },
  skeletonAvatar: { borderRadius: 17, height: 34, width: 34 },
  skeletonAuthor: { borderRadius: radius.pill, height: 12, width: 110 },
  skeletonMeta: { borderRadius: radius.pill, height: 10, marginTop: 4, width: 72 },
  skeletonTime: { borderRadius: radius.pill, height: 10, width: 28 },
  skeletonImage: { aspectRatio: 1, borderRadius: 0, width: '100%' },
  skeletonAction: { borderRadius: radius.pill, height: 22, width: 22 },
  skeletonCaption: {
    borderRadius: radius.pill,
    height: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    width: '55%',
  },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekday: {
    alignItems: 'center',
    backgroundColor: colors.backgroundRaised,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 43,
    paddingHorizontal: spacing.sm,
    paddingVertical: 11,
  },
  weekdaySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekdayText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  weekdayTextSelected: { color: colors.surface },
  photo: { backgroundColor: colors.surfaceMuted, width: '100%' },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  avatarImage: { backgroundColor: colors.surfaceMuted },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  avatarInitials: { color: colors.primary, fontWeight: '800' },
  feedItem: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
  },
  feedItemTemporary: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  feedHeaderText: { flex: 1, gap: 1 },
  feedAuthor: { color: colors.text, fontSize: 14, fontWeight: '700' },
  feedLocation: { color: colors.muted, fontSize: 12 },
  feedTime: { color: colors.muted, fontSize: 12 },
  feedDelete: { paddingLeft: spacing.xs },
  feedImage: { aspectRatio: 1 },
  feedImageWrap: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  tempPhotoWrap: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  tempPhoto: {
    aspectRatio: 3 / 4,
    width: '100%',
  },
  tempOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 18, 15, 0.42)',
    flexDirection: 'row',
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tempAuthor: { color: colors.white, fontSize: 14, fontWeight: '800' },
  tempMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' },
  tempTimerBadge: {
    backgroundColor: 'rgba(12, 18, 15, 0.55)',
    borderRadius: radius.pill,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    position: 'absolute',
    right: spacing.sm,
  },
  tempTimerText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },

  feedActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  feedActionsSpacer: { flex: 1 },
  feedReactions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  feedReactionStack: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  feedReactionOverlap: {
    marginLeft: -8,
  },
  feedReactionIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 18,
  },
  feedReactionMoreText: {
    color: colors.muted,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  feedCaption: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  feedViewComments: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent',
    borderWidth: 1,
  },
  buttonAccent: { backgroundColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  buttonTextSecondary: { color: colors.primary },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
