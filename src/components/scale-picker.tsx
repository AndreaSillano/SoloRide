import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type View as ViewType,
} from 'react-native';

import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

import { GlassSurface } from './glass';

const SCORES = [-3, -2, -1, 0, 1, 2, 3] as const;
export const REACTION_STEP_WIDTH = 32;
const TRACK_INNER_WIDTH = REACTION_STEP_WIDTH * SCORES.length;
const THUMB_SIZE = 24;
const DOT_SIZE = 6;
const END_CAP_SIZE = 32;
const SWIPE_THRESHOLD = 10;
/** Keep the overlay open briefly after a swipe so the selection is readable. */
const SWIPE_CONFIRM_DELAY_MS = 110;

/** Red → yellow → green across dislike → like. */
const DOT_COLORS = [
  '#E4473A',
  '#F06A2F',
  '#F5A623',
  '#F0D24A',
  '#A8D45A',
  '#5ECF6A',
  '#2ECC71',
] as const;

type WindowRect = { x: number; y: number; width: number; height: number };

export function clampReactionScore(value: number) {
  return Math.max(-3, Math.min(3, Math.round(value)));
}

/** Map horizontal drag distance onto the -3..+3 reaction scale. */
export function reactionScoreFromSwipe(startScore: number, dx: number) {
  return clampReactionScore(startScore + dx / REACTION_STEP_WIDTH);
}

function scoreAtTrackX(xInTrack: number) {
  const index = Math.floor(xInTrack / REACTION_STEP_WIDTH);
  return SCORES[Math.max(0, Math.min(SCORES.length - 1, index))] ?? 0;
}

function indexForScore(score: number) {
  const clamped = clampReactionScore(score);
  return SCORES.indexOf(clamped as (typeof SCORES)[number]);
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

function hintForScore(score: number) {
  if (score > 0) return 'Slide left to dislike ←';
  if (score < 0) return 'Slide right to like →';
  return 'Slide right to like →';
}

/** Glass capsule slider: swipe or tap a step on a -3..+3 like/dislike scale. */
export function ScalePicker({
  visible,
  selectedScore,
  onSelect,
  onClose,
  /** When false, parent owns the finger (long-press → swipe without lifting). */
  interactive = true,
}: {
  visible: boolean;
  selectedScore?: number | null;
  onSelect: (score: number) => void;
  onClose: () => void;
  interactive?: boolean;
}) {
  const initial = clampReactionScore(selectedScore ?? 0);
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
    const next = clampReactionScore(selectedScore ?? 0);
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
    onSelectRef.current(clampReactionScore(score));
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
          const next = reactionScoreFromSwipe(startScoreRef.current, gesture.dx);
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

  const activeIndex = Math.max(0, indexForScore(activeScore));
  const thumbLeft =
    activeIndex * REACTION_STEP_WIDTH + (REACTION_STEP_WIDTH - THUMB_SIZE) / 2;

  return (
    <View
      {...(interactive ? panResponder.panHandlers : {})}
      accessibilityLabel="Reaction slider"
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: -3,
        max: 3,
        now: activeScore,
        text:
          activeScore === 0
            ? 'Neutral'
            : activeScore > 0
              ? `Like ${activeScore}`
              : `Dislike ${Math.abs(activeScore)}`,
      }}
      pointerEvents={interactive ? 'auto' : 'none'}
      style={styles.overlay}
    >
      <View pointerEvents="box-none" style={styles.center}>
        <GlassSurface dark style={styles.capsule}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.endCap,
              activeScore < 0 && styles.endCapActiveDislike,
            ]}
          >
            <Text style={styles.endEmoji}>👎</Text>
          </View>

          <View ref={trackRef} style={styles.track}>
            <View style={styles.dotsRow}>
              {SCORES.map((score, index) => {
                const active = score === activeScore;
                return (
                  <View key={score} style={styles.cell}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: DOT_COLORS[index],
                          opacity: active ? 0 : 0.95,
                          transform: [{ scale: active ? 0.5 : 1 }],
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            <View
              pointerEvents="none"
              style={[styles.thumb, { left: thumbLeft }]}
            />
          </View>

          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.endCap, activeScore > 0 && styles.endCapActiveLike]}
          >
            <Text style={styles.endEmoji}>👍</Text>
          </View>
        </GlassSurface>

        <GlassSurface dark style={styles.hintPill}>
          <Text style={styles.hintText}>{hintForScore(activeScore)}</Text>
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
  center: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.sm,
    justifyContent: 'center',
    left: 0,
    // Nudge above true center so it sits in the upper-middle of the photo.
    paddingBottom: 72,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  capsule: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xxs,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  endCap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    flexShrink: 0,
    height: END_CAP_SIZE,
    justifyContent: 'center',
    width: END_CAP_SIZE,
  },
  endCapActiveDislike: {
    backgroundColor: 'rgba(228, 71, 58, 0.35)',
  },
  endCapActiveLike: {
    backgroundColor: 'rgba(46, 204, 113, 0.35)',
  },
  endEmoji: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  track: {
    flexShrink: 0,
    height: THUMB_SIZE,
    justifyContent: 'center',
    position: 'relative',
    width: TRACK_INNER_WIDTH,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: THUMB_SIZE,
    width: TRACK_INNER_WIDTH,
  },
  cell: {
    alignItems: 'center',
    height: THUMB_SIZE,
    justifyContent: 'center',
    width: REACTION_STEP_WIDTH,
  },
  dot: {
    borderRadius: DOT_SIZE / 2,
    height: DOT_SIZE,
    width: DOT_SIZE,
  },
  thumb: {
    backgroundColor: colors.white,
    borderRadius: THUMB_SIZE / 2,
    elevation: 4,
    height: THUMB_SIZE,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    top: 0,
    width: THUMB_SIZE,
  },
  hintPill: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  hintText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
