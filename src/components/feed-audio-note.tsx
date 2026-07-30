import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AudioNoteWaveform } from '@/components/audio-note-waveform';
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
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <Ionicons
        color={colors.white}
        name={playing ? 'pause' : 'play'}
        size={18}
        style={styles.playIcon}
      />
      <View style={styles.wave}>
        <AudioNoteWaveform
          active={playing}
          barCount={40}
          color={colors.white}
          durationSec={total}
          maxHeight={18}
          progress={total > 0 ? current / total : 0}
        />
      </View>
      <Text style={styles.duration}>
        {formatAudioDuration(playing ? current : total)}
      </Text>
    </Pressable>
  );
}

/** Glass voice-note control overlaid on the bottom of a feed photo. */
export function FeedAudioNote({ audioPath }: FeedAudioNoteProps) {
  const signed = useSignedPostAudio(audioPath);
  const url = signed.data?.url ?? null;

  if (signed.isPending) {
    return (
      <View style={styles.bar}>
        <ActivityIndicator color={colors.white} size="small" />
      </View>
    );
  }

  if (!url) return null;

  return <FeedAudioNotePlayer key={url} url={url} />;
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 20, 28, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.sm,
    zIndex: 4,
  },
  playIcon: {
    marginLeft: 2,
    width: 18,
  },
  wave: {
    flex: 1,
    minWidth: 0,
  },
  duration: {
    color: colors.white,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  pressed: { opacity: 0.85 },
});
