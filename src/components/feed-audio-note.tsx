import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AudioNoteWaveform } from '@/components/audio-note-waveform';
import { GlassSurface } from '@/components/glass';
import { formatAudioDuration, useSignedPostAudio } from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

type FeedAudioNoteProps = {
  audioPath: string;
};

function FeedAudioNotePlayer({ url }: { url: string }) {
  const player = useAudioPlayer(url, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const current = status.currentTime ?? 0;
  const total = status.duration ?? 0;

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (total > 0 && current >= total - 0.05)) {
      player.seekTo(0);
    }
    player.play();
    haptics.selection();
  };

  return (
    <Pressable
      accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
      accessibilityRole="button"
      onPress={toggle}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <GlassSurface dark isInteractive style={styles.pill}>
        <Text style={styles.duration}>
          {formatAudioDuration(playing ? current : total)}
        </Text>
        <View style={styles.wave}>
          <AudioNoteWaveform
            active={playing}
            barCount={28}
            color={colors.white}
            durationSec={total}
            maxHeight={16}
            progress={total > 0 ? current / total : undefined}
            vertical
          />
        </View>
        <Ionicons
          color={colors.white}
          name={playing ? 'pause' : 'play'}
          size={16}
          style={styles.playIcon}
        />
      </GlassSurface>
    </Pressable>
  );
}

/** Vertical glass voice-note control on the right edge of a feed photo. */
export function FeedAudioNote({ audioPath }: FeedAudioNoteProps) {
  const signed = useSignedPostAudio(audioPath);
  const url = signed.data?.url ?? null;

  if (signed.isPending) {
    return (
      <GlassSurface dark style={styles.pill}>
        <ActivityIndicator color={colors.white} size="small" />
      </GlassSurface>
    );
  }

  if (!url) return null;

  return <FeedAudioNotePlayer key={url} url={url} />;
}

const styles = StyleSheet.create({
  hit: {
    flex: 1,
  },
  pill: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    width: 44,
  },
  playIcon: {
    marginBottom: 2,
  },
  wave: {
    alignItems: 'center',
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  duration: {
    color: colors.white,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  pressed: { opacity: 0.85 },
});
