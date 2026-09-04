import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { toast, type ToastPayload } from '@/lib/toast';
import { colors, radius, shadows, spacing } from '@/theme';

import { canUseLiquidGlass, GlassSurface } from './glass';

const DISMISS_MS = {
  info: 3200,
  error: 4000,
} as const;

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<ToastPayload | null>(null);
  const translateY = useSharedValue(-72);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useRef<number | null>(null);
  const useGlass = canUseLiquidGlass();

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const finishHide = (clearStore: boolean) => {
    activeId.current = null;
    setActive(null);
    if (clearStore) {
      toast.dismiss();
    }
  };

  const hideAnimated = (clearStore = true) => {
    clearHideTimer();
    // Translate only — opacity on a GlassView parent kills the effect.
    translateY.value = withTiming(-72, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(finishHide)(clearStore);
      }
    });
  };

  const showAnimated = (next: ToastPayload) => {
    clearHideTimer();
    activeId.current = next.id;
    setActive(next);
    translateY.value = -72;
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });

    if (next.variant === 'error') {
      haptics.error();
    } else {
      haptics.light();
    }

    hideTimer.current = setTimeout(() => {
      if (activeId.current === next.id) {
        hideAnimated(true);
      }
    }, DISMISS_MS[next.variant]);
  };

  useEffect(() => {
    const unsubscribe = toast.subscribe((next) => {
      if (!next) {
        if (activeId.current !== null) {
          hideAnimated(false);
        }
        return;
      }
      showAnimated(next);
    });
    return () => {
      clearHideTimer();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!active) {
    return null;
  }

  const isError = active.variant === 'error';
  const iconColor = isError ? colors.primary : colors.textSoft;
  const iconName = isError ? 'alert-circle' : 'information-circle';

  const body = (
    <View style={styles.inner}>
      <View style={[styles.iconWrap, isError && styles.iconWrapError]}>
        <Ionicons color={iconColor} name={iconName} size={20} />
      </View>
      <Text style={styles.message}>{active.message}</Text>
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + spacing.xs }]}>
      <Animated.View pointerEvents="box-none" style={[styles.slot, animatedStyle]}>
        <Pressable
          accessibilityLiveRegion="polite"
          accessibilityRole={isError ? 'alert' : 'summary'}
          onPress={() => hideAnimated(true)}
        >
          {useGlass ? (
            <GlassSurface isInteractive style={styles.toastGlass} tintColor={colors.white}>
              {body}
            </GlassSurface>
          ) : (
            <View style={styles.toastSolid}>{body}</View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  slot: {
    paddingHorizontal: spacing.md,
  },
  toastGlass: {
    ...shadows.floating,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  toastSolid: {
    ...shadows.floating,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  iconWrapError: {
    backgroundColor: colors.primarySoft,
  },
  message: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
});
