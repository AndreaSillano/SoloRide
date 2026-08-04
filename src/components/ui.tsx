import { useHeaderHeight } from '@react-navigation/elements';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image as ExpoImage } from 'expo-image';
import type { PropsWithChildren, ReactElement, ReactNode, RefObject } from 'react';
import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
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
import {
  getCommentCount,
  formatProfileName,
  getReactionCount,
  getReactionScoreSum,
  reactionEmojiForScore,
  reactionSumToStickerSize,
  POST_IMAGE_ASPECT_RATIO,
  useSignedPostImage,
  type PostRecord,
} from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

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
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.white} />
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
    <ExpoImage
      accessibilityLabel={`Photo by ${author}`}
      cachePolicy="memory-disk"
      contentFit="contain"
      recyclingKey={post.image_path}
      source={{ uri: image.data.url, cacheKey: post.image_path }}
      style={[styles.photo, { aspectRatio }, style]}
      transition={150}
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
}) {
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
  const openPickerRef = useRef(onDoubleTapImage);
  const selectRef = useRef(onSelectReaction);
  const closePickerRef = useRef(onCloseReactionPicker);
  const pickerVisibleRef = useRef(reactionPickerVisible);
  const [holdPreviewScore, setHoldPreviewScore] = useState<number | null>(null);
  const [burstScore, setBurstScore] = useState<number | null>(null);
  /** Second tap must land within this window to count as a double-tap. */
  const DOUBLE_TAP_MS = 350;
  /** Slightly longer than the double-tap window so a late second tap still wins. */
  const SINGLE_TAP_DELAY_MS = 370;
  const LONG_PRESS_MS = 380;
  const MOVE_CANCEL_PX = 12;

  ownScoreRef.current = ownReactionScore;
  openPickerRef.current = onDoubleTapImage;
  selectRef.current = onSelectReaction;
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
    onSelectReaction && onCloseReactionPicker ? (
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
    burstScore != null && burstScore !== 0 ? (
      <ReactionBurst score={burstScore} onFinished={() => setBurstScore(null)} />
    ) : null;

  const commentLabel =
    commentCount === 0
      ? 'Add a comment'
      : commentCount === 1
        ? 'View 1 comment'
        : `View all ${commentCount} comments`;

  const reactionStickerEmoji =
    reactionCount > 0 ? reactionEmojiForScore(reactionSum <= -1 ? -1 : 1) : null;
  const reactionStickerSize = reactionSumToStickerSize(reactionSum === 0 ? 1 : reactionSum);
  // Large emoji glyphs overhang their em-box; pad the box so the top isn't clipped.
  const reactionStickerBox = Math.ceil(reactionStickerSize * 1.28);
  const reactionStickerDislike = reactionSum <= -1;
  // Hang a similar fraction of the hand off the corner as size grows.
  const isMaxSticker = reactionStickerSize >= 240;
  const reactionStickerBottom =
    -Math.round(reactionStickerBox * (reactionStickerDislike ? 0.48 : 0.3)) +
    (isMaxSticker ? 36 : 0);
  const reactionStickerRight =
    -Math.round(reactionStickerBox * 0.06) - (isMaxSticker ? 18 : 0);

  const reactionSticker =
    reactionStickerEmoji && onPressReactions ? (
      <Pressable
        accessibilityLabel={
          reactionCount === 1
            ? 'View 1 reaction'
            : `View all ${reactionCount} reactions`
        }
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPressReactions}
        style={({ pressed }) => [
          styles.feedReactionSticker,
          {
            bottom: reactionStickerBottom,
            right: reactionStickerRight,
            transform: [{ rotate: reactionStickerDislike ? '-14deg' : '14deg' }],
          },
          pressed && styles.pressed,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.feedReactionStickerEmoji,
            {
              fontSize: reactionStickerSize,
              height: reactionStickerBox,
              lineHeight: reactionStickerBox,
              width: reactionStickerBox,
            },
          ]}
        >
          {reactionStickerEmoji}
        </Text>
      </Pressable>
    ) : null;

  const actionsRow = (
    <View style={styles.feedActions}>
      <Pressable
        accessibilityLabel={commentLabel}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPress}
        style={({ pressed }) => [styles.feedCommentAction, pressed && styles.pressed]}
      >
        <Ionicons
          color={commentCount > 0 ? colors.textSoft : colors.muted}
          name="chatbubble-outline"
          size={23}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.feedViewCommentsInline,
            commentCount > 0 ? styles.feedViewCommentsActive : null,
          ]}
        >
          {commentLabel}
        </Text>
      </Pressable>
    </View>
  );

  const overflowButton = (
    <Pressable
      accessibilityLabel="Post options"
      accessibilityRole="button"
      hitSlop={10}
      onPress={openPostOverflowMenu}
      style={({ pressed }) => [styles.feedOverflow, pressed && styles.pressed]}
    >
      <Ionicons color={colors.muted} name="ellipsis-horizontal" size={18} />
    </Pressable>
  );

  const overflowButtonOnDark = (
    <Pressable
      accessibilityLabel="Post options"
      accessibilityRole="button"
      hitSlop={10}
      onPress={openPostOverflowMenu}
      style={({ pressed }) => [styles.feedOverflow, pressed && styles.pressed]}
    >
      <Ionicons color={colors.white} name="ellipsis-horizontal" size={18} />
    </Pressable>
  );

  if (post.is_temporary) {
    return (
      <View style={styles.feedItemTemporary}>
        <View
          style={styles.feedPhotoBlock}
        >
          <View style={styles.tempPhotoWrap} {...photoPanResponder.panHandlers}>
            <View
              accessibilityHint="Double-tap or long-press to react"
              accessibilityRole="imagebutton"
            >
              <PostImage aspectRatio={POST_IMAGE_ASPECT_RATIO} post={post} style={styles.tempPhoto} />
            </View>
            {post.video_path ? (
              <FeedVideoPlay
                durationMs={post.video_duration_ms}
                videoPath={post.video_path}
              />
            ) : null}
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
              {overflowButtonOnDark}
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
              <View
                style={[
                  styles.tempTimerBadge,
                  post.audio_path && !post.video_path
                    ? styles.tempTimerBadgeAboveAudio
                    : null,
                ]}
                pointerEvents="none"
              >
                <Text style={styles.tempTimerText}>{remaining}</Text>
              </View>
            ) : null}
            {!post.video_path && post.audio_path ? (
              <FeedAudioNote audioPath={post.audio_path} />
            ) : null}
            {reactionPicker}
          </View>
          {reactionBurst}
          {reactionSticker}
        </View>

        {actionsRow}

        {post.description ? (
          <Text style={styles.feedCaption}>
            <Text style={styles.feedAuthor}>{author} </Text>
            {post.description}
          </Text>
        ) : null}
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
        <View style={styles.feedTimeRow}>
          <Text style={styles.feedTime}>{formatFeedTimestamp(post.created_at)}</Text>
          {overflowButton}
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
              <ActivityIndicator color={colors.muted} size="small" />
            ) : (
              <Ionicons color={colors.muted} name="trash-outline" size={18} />
            )}
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.feedPhotoBlock}
      >
        <View style={styles.feedImageWrap} {...photoPanResponder.panHandlers}>
          <View
            accessibilityHint="Double-tap or long-press to react"
            accessibilityRole="imagebutton"
          >
            <PostImage aspectRatio={POST_IMAGE_ASPECT_RATIO} post={post} style={styles.feedImage} />
          </View>
          {post.video_path ? (
            <FeedVideoPlay durationMs={post.video_duration_ms} videoPath={post.video_path} />
          ) : post.audio_path ? (
            <FeedAudioNote audioPath={post.audio_path} />
          ) : null}
          {reactionPicker}
        </View>
        {reactionBurst}
        {reactionSticker}
      </View>

      {actionsRow}

      {post.description ? (
        <Text style={styles.feedCaption}>
          <Text style={styles.feedAuthor}>{author} </Text>
          {post.description}
        </Text>
      ) : null}
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
    paddingHorizontal: spacing.lg,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
  skeletonImage: { aspectRatio: POST_IMAGE_ASPECT_RATIO, borderRadius: 0, width: '100%' },
  skeletonAction: { borderRadius: radius.pill, height: 22, width: 22 },
  skeletonCaption: {
    borderRadius: radius.pill,
    height: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    width: '55%',
  },
  weekdays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  weekday: {
    alignItems: 'center',
    backgroundColor: colors.backgroundRaised,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
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
    overflow: 'visible',
    paddingBottom: spacing.sm,
  },
  feedItemTemporary: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
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
  feedTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  feedTime: { color: colors.muted, fontSize: 12 },
  feedOverflow: { paddingHorizontal: 2, paddingVertical: 2 },
  feedDelete: { paddingLeft: spacing.xs },
  feedImage: { aspectRatio: POST_IMAGE_ASPECT_RATIO },
  feedPhotoBlock: {
    overflow: 'visible',
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
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
    aspectRatio: POST_IMAGE_ASPECT_RATIO,
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
    zIndex: 5,
  },
  tempAuthor: { color: colors.white, fontSize: 14, fontWeight: '800' },
  tempMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' },
  tempTimerBadge: {
    backgroundColor: 'rgba(12, 18, 15, 0.55)',
    borderRadius: radius.pill,
    bottom: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    position: 'absolute',
    zIndex: 5,
  },
  tempTimerBadgeAboveAudio: {
    bottom: spacing.sm + 52,
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
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    zIndex: 1,
  },
  feedCommentAction: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs,
    maxWidth: '90%',
  },
  feedReactionSticker: {
    overflow: 'visible',
    position: 'absolute',
    zIndex: 4,
  },
  feedReactionStickerEmoji: {
    includeFontPadding: false,
    overflow: 'visible',
    textAlign: 'center',
    textAlignVertical: 'center',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  feedCaption: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  feedViewCommentsInline: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  feedViewCommentsActive: {
    color: colors.textSoft,
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
  buttonCompact: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent',
    borderWidth: 1,
  },
  buttonAccent: { backgroundColor: colors.accent },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  buttonTextCompact: { fontSize: 13, fontWeight: '700' },
  buttonTextSecondary: { color: colors.primary },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
