import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { reactionEmojiForScore } from '@/features/posts';

function burstSizeForScore(score: number) {
  const magnitude = Math.abs(score);
  if (magnitude >= 3) return 112;
  if (magnitude === 2) return 88;
  return 72;
}

/** Large centered emoji that pops in then dissolves — Instagram-style confirm. */
export function ReactionBurst({
  score,
  onFinished,
}: {
  score: number;
  onFinished?: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.35)).current;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const emoji = reactionEmojiForScore(score);
  const size = burstSizeForScore(score);
  // Large emoji glyphs overhang their em-box; pad so the spring/exit scale
  // doesn't clip the top of the ±3 burst against overflow:hidden ancestors.
  const box = Math.ceil(size * 1.32);

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(0.35);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.12,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(scale, {
        toValue: 1,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.22,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinishedRef.current?.();
    });

    return () => animation.stop();
  }, [score, opacity, scale]);

  if (!emoji) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.burst,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <Animated.Text
        allowFontScaling={false}
        style={[
          styles.emoji,
          {
            fontSize: size,
            height: box,
            lineHeight: box,
            width: box,
          },
        ]}
      >
        {emoji}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: {
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 6,
  },
  emoji: {
    includeFontPadding: false,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
