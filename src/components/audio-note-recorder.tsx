import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AudioNoteWaveform } from '@/components/audio-note-waveform';
import { Button } from '@/components/ui';
import { VOICE_NOTE_RECORDING } from '@/features/posts/audio';
import {
  formatAudioDuration,
  POST_AUDIO_MAX_DURATION_MS,
} from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

const CANCEL_SLIDE_PX = 64;
const MIN_SAVE_MS = 400;
const FOOTER_CONTROL_SIZE = 54;

type PublishAudioFooterProps = {
  audioUri: string | null;
  onAudioChange: (uri: string | null, durationMs: number | null) => void;
  publishDisabled: boolean;
  publishLoading: boolean;
  publishLabel: string;
  onPublish: () => void;
  /** Hides the voice-note control — video posts carry their own audio. */
  hideMic?: boolean;
};

export function PublishAudioFooter({
  audioUri,
  onAudioChange,
  publishDisabled,
  publishLoading,
  publishLabel,
  onPublish,
  hideMic = false,
}: PublishAudioFooterProps) {
  const recorder = useAudioRecorder(VOICE_NOTE_RECORDING);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [isRecording, setIsRecording] = useState(false);
  const [willCancel, setWillCancel] = useState(false);
  const startPageX = useRef(0);
  const willCancelRef = useRef(false);
  const pendingReplaceRef = useRef(false);
  const finishingRef = useRef(false);
  const startingRef = useRef(false);
  /** Finger still down — start is async, so pressOut can race prepare/record. */
  const holdingRef = useRef(false);
  /** Mirrors isRecording synchronously for press handlers. */
  const isRecordingRef = useRef(false);
  const autoStoppedRef = useRef(false);

  const resetCancel = () => {
    willCancelRef.current = false;
    setWillCancel(false);
  };

  const setRecordingActive = (active: boolean) => {
    isRecordingRef.current = active;
    setIsRecording(active);
  };

  const finishRecording = useCallback(
    async (cancelled: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      try {
        let durationMs = 0;
        try {
          durationMs = recorder.getStatus().durationMillis ?? 0;
        } catch {
          durationMs = 0;
        }
        if (recorder.isRecording) {
          await recorder.stop();
        }
        setRecordingActive(false);
        resetCancel();

        if (cancelled || durationMs < MIN_SAVE_MS) {
          haptics.light();
          return;
        }

        const uri = recorder.uri;
        if (!uri) {
          haptics.error();
          return;
        }
        onAudioChange(uri, durationMs);
        haptics.success();
      } catch {
        setRecordingActive(false);
        resetCancel();
        haptics.error();
      } finally {
        finishingRef.current = false;
      }
    },
    [onAudioChange, recorder],
  );

  const beginRecording = useCallback(async () => {
    if (
      startingRef.current ||
      finishingRef.current ||
      isRecordingRef.current
    ) {
      return;
    }
    startingRef.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone needed',
          'Allow Rhodeo to use the microphone to record a voice note.',
        );
        return;
      }
      // Quick tap: finger already up before native session is ready.
      if (!holdingRef.current) return;

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      if (!holdingRef.current) return;

      await recorder.prepareToRecordAsync();
      if (!holdingRef.current) return;

      recorder.record();
      autoStoppedRef.current = false;
      setRecordingActive(true);
      resetCancel();

      // PressOut raced past prepare — discard so the bar doesn't stick open.
      if (!holdingRef.current) {
        await finishRecording(true);
      }
    } catch {
      setRecordingActive(false);
      haptics.error();
      Alert.alert('Recording failed', 'Could not start the voice note. Try again.');
    } finally {
      startingRef.current = false;
    }
  }, [finishRecording, recorder]);

  useEffect(() => {
    if (
      !isRecording ||
      autoStoppedRef.current ||
      recorderState.durationMillis < POST_AUDIO_MAX_DURATION_MS
    ) {
      return;
    }
    autoStoppedRef.current = true;
    void finishRecording(false);
  }, [finishRecording, isRecording, recorderState.durationMillis]);

  const confirmReplaceThenRecord = () => {
    Alert.alert(
      'Replace voice note?',
      'Recording a new note will replace the one you already attached.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => {
            onAudioChange(null, null);
            haptics.warning();
          },
        },
      ],
    );
  };

  const onMicPressIn = (event: GestureResponderEvent) => {
    if (publishLoading) return;
    if (audioUri) {
      pendingReplaceRef.current = true;
      return;
    }
    // Already armed or recording — wait for pressOut to stop.
    if (isRecordingRef.current || startingRef.current) return;
    pendingReplaceRef.current = false;
    holdingRef.current = true;
    startPageX.current = event.nativeEvent.pageX;
    haptics.medium();
    void beginRecording();
  };

  const onMicTouchMove = (event: GestureResponderEvent) => {
    if (!isRecordingRef.current) return;
    const dx = event.nativeEvent.pageX - startPageX.current;
    const cancel = dx < -CANCEL_SLIDE_PX;
    if (cancel !== willCancelRef.current) {
      willCancelRef.current = cancel;
      setWillCancel(cancel);
      if (cancel) haptics.warning();
      else haptics.selection();
    }
  };

  const onMicPressOut = () => {
    holdingRef.current = false;
    if (pendingReplaceRef.current) {
      pendingReplaceRef.current = false;
      confirmReplaceThenRecord();
      return;
    }
    // Start still in flight — beginRecording will abort when it sees !holding.
    if (!isRecordingRef.current) return;
    void finishRecording(willCancelRef.current);
  };

  const elapsedLabel = formatAudioDuration(
    Math.min(POST_AUDIO_MAX_DURATION_MS, recorderState.durationMillis) / 1000,
  );

  const hasNote = Boolean(audioUri) && !isRecording;
  const micIconColor = willCancel
    ? colors.white
    : isRecording
      ? colors.white
      : hasNote
        ? colors.accent
        : colors.primary;

  return (
    <View style={styles.footerRow}>
      {isRecording ? (
        <View
          style={[
            styles.recordingBar,
            willCancel && styles.recordingBarCancel,
          ]}
        >
          <View
            style={[styles.recordingDot, willCancel && styles.recordingDotCancel]}
          />
          <Text style={[styles.timer, willCancel && styles.timerCancel]}>
            {elapsedLabel}
          </Text>
          <AudioNoteWaveform
            active
            color={willCancel ? colors.danger : colors.accent}
            maxHeight={20}
          />
          <Text style={[styles.slideHint, willCancel && styles.slideHintCancel]}>
            {willCancel ? 'Release to cancel' : 'Slide to cancel'}
          </Text>
        </View>
      ) : (
        <View style={styles.publishSlot}>
          <Button
            disabled={publishDisabled}
            loading={publishLoading}
            onPress={onPublish}
          >
            {publishLabel}
          </Button>
        </View>
      )}

      {hideMic ? null : (
        <Pressable
          accessibilityLabel="Hold to record voice note"
          accessibilityRole="button"
          disabled={publishLoading}
          // Keep the gesture alive while sliding left off the mic.
          hitSlop={
            isRecording
              ? { top: 48, bottom: 48, left: 280, right: 48 }
              : { top: 8, bottom: 8, left: 8, right: 8 }
          }
          onPressIn={onMicPressIn}
          onPressOut={onMicPressOut}
          onTouchMove={onMicTouchMove}
          style={({ pressed }) => [
            styles.micButton,
            isRecording && styles.micButtonRecording,
            willCancel && styles.micButtonCancel,
            hasNote && styles.micButtonHasNote,
            (pressed || publishLoading) && styles.pressed,
          ]}
        >
          <Ionicons
            color={micIconColor}
            name={willCancel ? 'trash-outline' : 'mic'}
            size={22}
          />
        </Pressable>
      )}
    </View>
  );
}

type AudioNotePreviewProps = {
  uri: string;
  durationMs: number | null;
  onClear: () => void;
};

/** Compose-screen preview: listen again or remove before publishing. */
export function AudioNotePreview({
  uri,
  durationMs,
  onClear,
}: AudioNotePreviewProps) {
  const player = useAudioPlayer(uri, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const current = status.currentTime ?? 0;
  const total =
    status.duration && status.duration > 0
      ? status.duration
      : (durationMs ?? 0) / 1000;

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
    <View style={styles.previewBlock}>
      <View style={styles.previewLabelRow}>
        <Text style={styles.sectionLabel}>Voice note</Text>
        <Text style={styles.captionMeta}>optional</Text>
      </View>
      <View style={styles.previewCard}>
        <Pressable
          accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={toggle}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          <Ionicons
            color={colors.white}
            name={playing ? 'pause' : 'play'}
            size={16}
          />
        </Pressable>
        <View style={styles.previewWave}>
          <AudioNoteWaveform
            active={playing}
            barCount={36}
            color={colors.accent}
            durationSec={total}
            maxHeight={20}
            progress={total > 0 ? current / total : 0}
          />
        </View>
        <Text style={styles.previewDuration}>
          {formatAudioDuration(playing ? current : total)}
        </Text>
        <Pressable
          accessibilityLabel="Remove voice note"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            player.pause();
            onClear();
            haptics.light();
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons color={colors.muted} name="close-circle" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  publishSlot: { flex: 1 },
  recordingBar: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: FOOTER_CONTROL_SIZE,
    paddingHorizontal: spacing.md,
  },
  recordingBarCancel: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.danger,
  },
  recordingDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  recordingDotCancel: {
    backgroundColor: colors.danger,
  },
  timer: {
    color: colors.text,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 36,
  },
  timerCancel: { color: colors.danger },
  slideHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  slideHintCancel: { color: colors.danger },
  micButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    height: FOOTER_CONTROL_SIZE,
    justifyContent: 'center',
    width: FOOTER_CONTROL_SIZE,
  },
  micButtonRecording: {
    backgroundColor: colors.accent,
  },
  micButtonCancel: {
    backgroundColor: colors.danger,
  },
  micButtonHasNote: {
    backgroundColor: colors.accentSoft,
  },
  previewBlock: { gap: spacing.xs },
  previewLabelRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  captionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  previewCard: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  previewWave: {
    flex: 1,
    minWidth: 0,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  previewDuration: {
    color: colors.textSoft,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: 36,
  },
  pressed: { opacity: 0.75 },
});
