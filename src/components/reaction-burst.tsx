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

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(0.35);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.15,
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
          toValue: 1.35,
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
      <Animated.Text style={[styles.emoji, { fontSize: size, lineHeight: size + 8 }]}>
        {emoji}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  emoji: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
