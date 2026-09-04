import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

const DEFAULT_BAR_COUNT = 16;
const BAR_HEIGHTS = [
  7, 12, 18, 10, 22, 14, 19, 9, 16, 21, 11, 17, 13, 20, 10, 15, 8, 18, 12, 22, 14,
  19, 9, 16, 21, 11, 17, 13, 20, 10, 15, 12, 18, 8, 21, 14,
];

function WaveBar({
  index,
  active,
  color,
  maxExtent,
  animate,
  opacity = 1,
  vertical = false,
}: {
  index: number;
  active: boolean;
  color: string;
  /** Varying dimension: height (horizontal wave) or width (vertical wave). */
  maxExtent: number;
  animate: boolean;
  opacity?: number;
  vertical?: boolean;
}) {
  const scale = useSharedValue(animate ? 0.4 + (index % 4) * 0.06 : 1);
  const extent = Math.max(
    5,
    Math.min(maxExtent, BAR_HEIGHTS[index % BAR_HEIGHTS.length] ?? 12),
  );

  useEffect(() => {
    if (!animate) {
      scale.value = 1;
      return;
    }
    if (!active) {
      scale.value = withTiming(0.4, { duration: 160 });
      return;
    }
    scale.value = withRepeat(
      withTiming(0.55 + ((index * 13) % 40) / 100, {
        duration: 320 + (index % 4) * 50,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [active, animate, index, scale]);

  const style = useAnimatedStyle(() => {
    const value = Math.max(0.25, scale.value);
    return {
      transform: [vertical ? { scaleX: value } : { scaleY: value }],
    };
  });

  return (
    <Animated.View
      style={[
        vertical ? styles.barVertical : styles.bar,
        {
          backgroundColor: color,
          ...(vertical ? { width: extent } : { height: extent }),
          opacity,
        },
        style,
      ]}
    />
  );
}

function WaveRow({
  bars,
  color,
  maxExtent,
  active,
  animate,
  opacity = 1,
  size,
  vertical = false,
}: {
  bars: number[];
  color: string;
  maxExtent: number;
  active: boolean;
  animate: boolean;
  opacity?: number;
  /** Fixed size along the progress axis (width horizontal / height vertical). */
  size?: number | string;
  vertical?: boolean;
}) {
  return (
    <View
      style={[
        vertical ? styles.column : styles.row,
        vertical
          ? { width: maxExtent, height: size ?? '100%' }
          : { height: maxExtent, width: size ?? '100%' },
      ]}
    >
      {bars.map((index) => (
        <WaveBar
          active={active}
          animate={animate}
          color={color}
          index={index}
          key={index}
          maxExtent={maxExtent}
          opacity={opacity}
          vertical={vertical}
        />
      ))}
    </View>
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** Decorative waveform; pass `progress` (0–1) to show playback fill. */
export function AudioNoteWaveform({
  active = true,
  barCount = DEFAULT_BAR_COUNT,
  color = colors.accent,
  durationSec = 0,
  maxHeight = 22,
  progress,
  vertical = false,
}: {
  active?: boolean;
  barCount?: number;
  color?: string;
  /** Total duration in seconds — used to run a continuous fill while playing. */
  durationSec?: number;
  /** Max bar extent: height when horizontal, width when vertical. */
  maxHeight?: number;
  /** 0–1 playback position. Fills left→right, or bottom→top when vertical. */
  progress?: number;
  vertical?: boolean;
}) {
  const bars = useMemo(
    () => Array.from({ length: barCount }, (_, index) => index),
    [barCount],
  );
  const useProgress = typeof progress === 'number';
  const [trackSize, setTrackSize] = useState(0);
  const fill = useSharedValue(0);
  const progressRef = useRef(0);

  if (useProgress) {
    progressRef.current = clamp01(progress);
  }

  useEffect(() => {
    if (!useProgress) return;

    cancelAnimation(fill);
    const next = progressRef.current;

    if (!active) {
      fill.value = next;
      return;
    }

    fill.value = next;
    if (durationSec <= 0 || next >= 0.999) return;

    fill.value = withTiming(1, {
      duration: Math.max(0, (1 - next) * durationSec * 1000),
      easing: Easing.linear,
    });
  }, [active, durationSec, fill, useProgress]);

  useEffect(() => {
    if (!useProgress || !active) return;
    const next = clamp01(progress);
    if (next > fill.value - 0.05) return;
    cancelAnimation(fill);
    fill.value = next;
    if (durationSec <= 0) return;
    fill.value = withTiming(1, {
      duration: Math.max(0, (1 - next) * durationSec * 1000),
      easing: Easing.linear,
    });
  }, [active, durationSec, fill, progress, useProgress]);

  const fillStyle = useAnimatedStyle(() =>
    vertical
      ? { height: trackSize * fill.value }
      : { width: trackSize * fill.value },
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    const next = Math.round(vertical ? layout.height : layout.width);
    if (next > 0 && next !== trackSize) setTrackSize(next);
  };

  if (!useProgress) {
    return (
      <WaveRow
        active={active}
        animate={active}
        bars={bars}
        color={color}
        maxExtent={maxHeight}
        vertical={vertical}
      />
    );
  }

  // Idle: solid wave. Progress dual-layer only after playback has started.
  const started = active || clamp01(progress) > 0.001;
  if (!started) {
    return (
      <WaveRow
        active={false}
        animate={false}
        bars={bars}
        color={color}
        maxExtent={maxHeight}
        vertical={vertical}
      />
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        vertical ? { width: maxHeight, flex: 1 } : { height: maxHeight },
      ]}
    >
      <Animated.View
        style={[vertical ? styles.fillClipVertical : styles.fillClip, fillStyle]}
      >
        <View
          style={[
            vertical ? styles.fillWaveVertical : styles.fillWave,
            vertical
              ? { height: trackSize || '100%' }
              : { width: trackSize || '100%' },
          ]}
        >
          <WaveRow
            active={false}
            animate={false}
            bars={bars}
            color={color}
            maxExtent={maxHeight}
            opacity={1}
            size={trackSize || '100%'}
            vertical={vertical}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  fillClip: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  fillClipVertical: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
  },
  fillWave: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  fillWaveVertical: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 2.5,
    justifyContent: 'space-between',
    minWidth: 0,
    width: '100%',
  },
  column: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'column',
    gap: 2.5,
    height: '100%',
    justifyContent: 'space-between',
    minHeight: 0,
  },
  bar: {
    borderRadius: 1.5,
    flexGrow: 1,
    maxWidth: 3.5,
    minWidth: 2,
    width: 2.5,
  },
  barVertical: {
    borderRadius: 1.5,
    flexGrow: 1,
    height: 2.5,
    maxHeight: 3.5,
    minHeight: 2,
  },
});
