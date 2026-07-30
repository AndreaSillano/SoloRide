import Ionicons from '@expo/vector-icons/Ionicons';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAudioDuration, POST_IMAGE_ASPECT_RATIO } from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

type PublishVideoPreviewProps = {
  videoUri: string;
  thumbnailUri: string;
  durationMs: number | null;
};

function PlayingPreview({
  uri,
  durationMs,
}: {
  uri: string;
  durationMs: number | null;
}) {
  const totalSec = durationMs ? durationMs / 1000 : 0;
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
  });
  const [ended, setEnded] = useState(false);

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
  });

  useEffect(() => {
    if (isPlaying) setEnded(false);
  }, [isPlaying]);

  const elapsedSec = ended
    ? totalSec
    : Math.min(totalSec, Math.max(0, Number.isFinite(currentTime) ? currentTime : 0));
  const timerLabel = totalSec > 0 ? formatAudioDuration(elapsedSec) : null;

  const toggle = () => {
    if (isPlaying) {
      player.pause();
    } else if (ended) {
      player.replay();
      player.play();
      setEnded(false);
    } else {
      player.play();
    }
    haptics.selection();
  };

  return (
    <Pressable
      accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
      accessibilityRole="button"
      onPress={toggle}
      style={styles.media}
    >
      <VideoView
        contentFit="cover"
        nativeControls={false}
        player={player}
        style={StyleSheet.absoluteFill}
      />
      {!isPlaying ? (
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.playButton}>
            <Ionicons color={colors.white} name="play" size={22} style={styles.playIcon} />
          </View>
        </View>
      ) : null}
      {timerLabel ? (
        <View pointerEvents="none" style={styles.durationBadge}>
          <Text style={styles.durationText}>{timerLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Compose-screen preview: thumbnail until tapped, then local playback. */
export function PublishVideoPreview({
  videoUri,
  thumbnailUri,
  durationMs,
}: PublishVideoPreviewProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return <PlayingPreview durationMs={durationMs} key={videoUri} uri={videoUri} />;
  }

  return (
    <Pressable
      accessibilityLabel="Play video"
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        setPlaying(true);
      }}
      style={styles.media}
    >
      <Image resizeMode="cover" source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.playButton}>
          <Ionicons color={colors.white} name="play" size={22} style={styles.playIcon} />
        </View>
      </View>
      {durationMs ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatAudioDuration(durationMs / 1000)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  media: {
    aspectRatio: POST_IMAGE_ASPECT_RATIO,
    backgroundColor: '#000',
    overflow: 'hidden',
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    justifyContent: 'center',
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 20, 28, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  playIcon: { marginLeft: 3 },
  durationBadge: {
    backgroundColor: 'rgba(16, 20, 28, 0.58)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  durationText: {
    color: colors.white,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
});
