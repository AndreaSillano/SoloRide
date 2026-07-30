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
  maxHeight,
  animate,
  opacity = 1,
}: {
  index: number;
  active: boolean;
  color: string;
  maxHeight: number;
  animate: boolean;
  opacity?: number;
}) {
  const scale = useSharedValue(animate ? 0.4 + (index % 4) * 0.06 : 1);

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

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: Math.max(0.25, scale.value) }],
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: color,
          height: Math.max(
            5,
            Math.min(maxHeight, BAR_HEIGHTS[index % BAR_HEIGHTS.length] ?? 12),
          ),
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
  maxHeight,
  active,
  animate,
  opacity = 1,
  width,
}: {
  bars: number[];
  color: string;
  maxHeight: number;
  active: boolean;
  animate: boolean;
  opacity?: number;
  width?: number | string;
}) {
  return (
    <View style={[styles.row, { height: maxHeight, width: width ?? '100%' }]}>
      {bars.map((index) => (
        <WaveBar
          active={active}
          animate={animate}
          color={color}
          index={index}
          key={index}
          maxHeight={maxHeight}
          opacity={opacity}
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
}: {
  active?: boolean;
  barCount?: number;
  color?: string;
  /** Total duration in seconds — used to run a continuous fill while playing. */
  durationSec?: number;
  maxHeight?: number;
  /** 0–1 playback position. When set, bars fill left → right. */
  progress?: number;
}) {
  const bars = useMemo(
    () => Array.from({ length: barCount }, (_, index) => index),
    [barCount],
  );
  const useProgress = typeof progress === 'number';
  const [trackWidth, setTrackWidth] = useState(0);
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

    // Seed from the latest known position, then run continuously to the end.
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
    // Restart / seek backwards while playing.
    if (next > fill.value - 0.05) return;
    cancelAnimation(fill);
    fill.value = next;
    if (durationSec <= 0) return;
    fill.value = withTiming(1, {
      duration: Math.max(0, (1 - next) * durationSec * 1000),
      easing: Easing.linear,
    });
  }, [active, durationSec, fill, progress, useProgress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * fill.value,
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== trackWidth) setTrackWidth(next);
  };

  if (!useProgress) {
    return (
      <WaveRow
        active={active}
        animate
        bars={bars}
        color={color}
        maxHeight={maxHeight}
      />
    );
  }

  return (
    <View onLayout={onLayout} style={[styles.track, { height: maxHeight }]}>
      <View style={styles.layer}>
        <WaveRow
          active={false}
          animate={false}
          bars={bars}
          color={color}
          maxHeight={maxHeight}
          opacity={0.3}
        />
      </View>
      <Animated.View style={[styles.fillClip, fillStyle]}>
        <View style={[styles.fillWave, { width: trackWidth || '100%' }]}>
          <WaveRow
            active={false}
            animate={false}
            bars={bars}
            color={color}
            maxHeight={maxHeight}
            opacity={1}
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
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  fillClip: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  fillWave: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
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
  bar: {
    borderRadius: 1.5,
    flexGrow: 1,
    maxWidth: 3.5,
    minWidth: 2,
    width: 2.5,
  },
});
