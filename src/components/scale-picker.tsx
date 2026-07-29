import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type View as ViewType,
} from 'react-native';

import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

const SCORES = [-3, -2, -1, 0, 1, 2, 3] as const;
const STEP_WIDTH = 56;
const TRACK_WIDTH = STEP_WIDTH * SCORES.length;
const SWIPE_THRESHOLD = 10;
/** Keep the overlay open briefly after a swipe so the selection is readable. */
const SWIPE_CONFIRM_DELAY_MS = 110;

type WindowRect = { x: number; y: number; width: number; height: number };

function clampScore(value: number) {
  return Math.max(-3, Math.min(3, Math.round(value)));
}

function iconSizeForScore(score: number) {
  const magnitude = Math.abs(score);
  if (magnitude >= 3) return 44;
  if (magnitude === 2) return 34;
  if (magnitude === 1) return 26;
  return 14;
}

function opacityForScore(score: number, active: boolean) {
  if (score === 0) return active ? 1 : 0.55;
  const magnitude = Math.abs(score);
  const base = magnitude === 3 ? 1 : magnitude === 2 ? 0.85 : 0.65;
  return active ? 1 : base * 0.7;
}

function scoreAtTrackX(xInTrack: number) {
  const index = Math.floor(xInTrack / STEP_WIDTH);
  return SCORES[Math.max(0, Math.min(SCORES.length - 1, index))] ?? 0;
}

function measureWindow(view: ViewType | null): Promise<WindowRect | null> {
  return new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

/** Dark in-photo overlay: swipe anywhere or tap a step on a -3..+3 scale. */
export function ScalePicker({
  visible,
  selectedScore,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedScore?: number | null;
  onSelect: (score: number) => void;
  onClose: () => void;
}) {
  const initial = clampScore(selectedScore ?? 0);
  const [activeScore, setActiveScore] = useState(initial);
  const activeScoreRef = useRef(activeScore);
  const startScoreRef = useRef(initial);
  const didSwipeRef = useRef(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<ViewType | null>(null);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible) {
      clearConfirmTimer();
      return;
    }
    const next = clampScore(selectedScore ?? 0);
    setActiveScore(next);
    activeScoreRef.current = next;
    startScoreRef.current = next;
    didSwipeRef.current = false;
  }, [visible, selectedScore]);

  useEffect(() => () => clearConfirmTimer(), []);

  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  onSelectRef.current = onSelect;
  onCloseRef.current = onClose;

  const confirm = (score: number) => {
    clearConfirmTimer();
    onSelectRef.current(clampScore(score));
    onCloseRef.current();
  };

  const scheduleSwipeConfirm = () => {
    clearConfirmTimer();
    confirmTimerRef.current = setTimeout(() => {
      confirmTimerRef.current = null;
      onSelectRef.current(activeScoreRef.current);
      onCloseRef.current();
    }, SWIPE_CONFIRM_DELAY_MS);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Own the gesture for the whole overlay so the feed ScrollView
        // cannot steal the swipe and dismiss mid-slide.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          clearConfirmTimer();
          startScoreRef.current = activeScoreRef.current;
          didSwipeRef.current = false;
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
            didSwipeRef.current = true;
          }
          if (!didSwipeRef.current) return;
          const next = clampScore(startScoreRef.current + gesture.dx / STEP_WIDTH);
          if (next !== activeScoreRef.current) {
            activeScoreRef.current = next;
            setActiveScore(next);
            haptics.selection();
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (didSwipeRef.current) {
            scheduleSwipeConfirm();
            return;
          }

          // Tap with almost no movement: hit a scale step, or dismiss.
          const pageX = gesture.moveX || gesture.x0;
          const pageY = gesture.moveY || gesture.y0;
          void measureWindow(trackRef.current).then((track) => {
            if (
              track &&
              pageX >= track.x &&
              pageX <= track.x + track.width &&
              pageY >= track.y &&
              pageY <= track.y + track.height
            ) {
              const score = scoreAtTrackX(pageX - track.x);
              haptics.selection();
              confirm(score);
              return;
            }
            onCloseRef.current();
          });
        },
        // If something still terminates us, keep the picker open — do not
        // auto-confirm/close mid-gesture.
        onPanResponderTerminate: () => {
          didSwipeRef.current = false;
        },
      }),
    [],
  );

  if (!visible) return null;

  return (
    <View {...panResponder.panHandlers} style={styles.overlay}>
      <View pointerEvents="box-none" style={styles.center}>
        <View ref={trackRef} style={styles.track}>
          {SCORES.map((score) => {
            const active = score === activeScore;
            const size = iconSizeForScore(score);
            const opacity = opacityForScore(score, active);
            return (
              <View
                accessibilityLabel={
                  score === 0
                    ? 'Clear reaction'
                    : score > 0
                      ? `Like ${score}`
                      : `Dislike ${Math.abs(score)}`
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={score}
                style={[styles.cell, active && styles.cellActive]}
              >
                {score === 0 ? (
                  <View
                    style={[
                      styles.dot,
                      {
                        opacity,
                        transform: [{ scale: active ? 1.25 : 1 }],
                      },
                    ]}
                  />
                ) : (
                  <MaterialIcons
                    color={colors.white}
                    name={score > 0 ? 'thumb-up' : 'thumb-down'}
                    size={size}
                    style={{ opacity }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 5,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 88,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    width: TRACK_WIDTH,
  },
  cell: {
    alignItems: 'center',
    height: 72,
    justifyContent: 'center',
    width: STEP_WIDTH,
  },
  cellActive: {
    transform: [{ scale: 1.08 }],
  },
  dot: {
    backgroundColor: colors.white,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
});
