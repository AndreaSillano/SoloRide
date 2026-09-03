import Ionicons from '@expo/vector-icons/Ionicons';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassIconButton, GlassSurface } from '@/components/glass';
import { formatAudioDuration, useSignedPostVideo } from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

type FeedVideoPlayProps = {
  videoPath: string;
  durationMs: number | null;
};

const CONTROLS_HIDE_MS = 2500;
const PLAY_SIZE = 64;
const VOLUME_SIZE = 36;

function FeedVideoPlayer({
  url,
  durationMs,
}: {
  url: string;
  durationMs: number | null;
}) {
  const totalSec = durationMs ? durationMs / 1000 : 0;
  const player = useVideoPlayer(url, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
  });
  const [ended, setEnded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const elapsedSec = ended
    ? totalSec
    : Math.min(totalSec, Math.max(0, Number.isFinite(currentTime) ? currentTime : 0));
  const timerLabel = totalSec > 0 ? formatAudioDuration(elapsedSec) : null;

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = null;
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      setControlsVisible(false);
      hideTimer.current = null;
    }, CONTROLS_HIDE_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
    setControlsVisible(true);
    clearHideTimer();
  });

  useEffect(() => {
    if (isPlaying) setEnded(false);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying && controlsVisible) {
      scheduleHide();
      return clearHideTimer;
    }
    clearHideTimer();
    if (!isPlaying) setControlsVisible(true);
  }, [isPlaying, controlsVisible]);

  const showControls = () => {
    setControlsVisible(true);
    haptics.selection();
    if (player.playing) scheduleHide();
  };

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      setControlsVisible(true);
      clearHideTimer();
    } else if (ended) {
      player.replay();
      player.play();
      setEnded(false);
      setControlsVisible(true);
      scheduleHide();
    } else {
      player.play();
      setControlsVisible(true);
      scheduleHide();
    }
    haptics.selection();
  };

  const toggleMute = () => {
    player.muted = !player.muted;
    haptics.selection();
    if (player.playing) {
      setControlsVisible(true);
      scheduleHide();
    }
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <VideoView
        contentFit="cover"
        nativeControls={false}
        player={player}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {timerLabel ? (
        <View pointerEvents="none" style={styles.durationBadgeWrap}>
          <GlassSurface dark style={styles.durationBadge}>
            <Text style={styles.durationText}>{timerLabel}</Text>
          </GlassSurface>
        </View>
      ) : null}

      {controlsVisible ? (
        <View pointerEvents="box-none" style={styles.controlsCluster}>
          <GlassIconButton
            accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
            color={colors.white}
            dark
            icon={muted ? 'volume-mute' : 'volume-high'}
            iconSize={20}
            onPress={toggleMute}
            size={VOLUME_SIZE}
          />
          <Pressable
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
            accessibilityRole="button"
            hitSlop={8}
            onPress={togglePlay}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <GlassSurface dark isInteractive style={styles.playControl}>
              <Ionicons
                color={colors.white}
                name={isPlaying ? 'pause' : 'play'}
                size={28}
                style={isPlaying ? undefined : styles.playIcon}
              />
            </GlassSurface>
          </Pressable>
        </View>
      ) : (
        // Same spot as the play button — tap to bring controls back without
        // covering the rest of the frame (likes / double-tap still work).
        <Pressable
          accessibilityLabel="Show video controls"
          accessibilityRole="button"
          onPress={showControls}
          style={styles.playButtonHit}
        />
      )}
    </View>
  );
}

/**
 * Thumbnail-first video: cover stays visible until play is tapped.
 * While playing, controls auto-hide; tap the center to show volume + play/pause.
 * After the clip ends, play seeks back to the start and replays.
 */
export function FeedVideoPlay({ videoPath, durationMs }: FeedVideoPlayProps) {
  const [activated, setActivated] = useState(false);
  const signed = useSignedPostVideo(activated ? videoPath : null);
  const url = signed.data?.url ?? null;

  if (activated && url) {
    return <FeedVideoPlayer durationMs={durationMs} key={url} url={url} />;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={styles.dim}>
        {activated ? <ActivityIndicator color={colors.white} size="large" /> : null}
      </View>
      {!activated ? (
        <Pressable
          accessibilityLabel="Play video"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            haptics.light();
            setActivated(true);
          }}
          style={({ pressed }) => [styles.playButtonWrap, pressed && styles.pressed]}
        >
          <GlassSurface dark isInteractive style={styles.playControl}>
            <Ionicons color={colors.white} name="play" size={28} style={styles.playIcon} />
          </GlassSurface>
        </Pressable>
      ) : null}
      {durationMs ? (
        <View pointerEvents="none" style={styles.durationBadgeWrap}>
          <GlassSurface dark style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatAudioDuration(durationMs / 1000)}</Text>
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    justifyContent: 'center',
  },
  controlsCluster: {
    alignItems: 'center',
    gap: spacing.sm,
    left: '50%',
    marginLeft: -PLAY_SIZE / 2,
    // Play control stays on the old center; volume sits above it.
    marginTop: -(PLAY_SIZE / 2 + VOLUME_SIZE + spacing.sm),
    position: 'absolute',
    top: '50%',
    width: PLAY_SIZE,
  },
  playControl: {
    alignItems: 'center',
    borderRadius: PLAY_SIZE / 2,
    height: PLAY_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: PLAY_SIZE,
  },
  playButtonWrap: {
    left: '50%',
    marginLeft: -PLAY_SIZE / 2,
    marginTop: -PLAY_SIZE / 2,
    position: 'absolute',
    top: '50%',
  },
  playButtonHit: {
    height: PLAY_SIZE,
    left: '50%',
    marginLeft: -PLAY_SIZE / 2,
    marginTop: -PLAY_SIZE / 2,
    position: 'absolute',
    top: '50%',
    width: PLAY_SIZE,
  },
  playIcon: { marginLeft: 4 },
  durationBadgeWrap: {
    position: 'absolute',
    right: spacing.sm,
    // Sit below the temporary-post author row (avatar 34 + vertical padding).
    top: spacing.sm * 2 + 34 + spacing.xs,
    zIndex: 6,
  },
  durationBadge: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  durationText: {
    color: colors.white,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  pressed: { opacity: 0.75 },
});
