import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { GlassIconButton } from '@/components/glass';
import { PhotoTextEditor } from '@/components/photo-text-editor';
import {
  Body,
  Button,
  CenteredBusy,
  ErrorBanner,
  Heading,
} from '@/components/ui';
import {
  cropImageToPostAspect,
  deleteLocalMediaFile,
  deleteLocalMediaFiles,
  formatAudioDuration,
  generatePostVideoThumbnail,
  getPostCaptureFramePadding,
  getPostFrameSize,
  POST_CAPTURE_TAB_BAR_CLEARANCE,
  POST_VIDEO_MAX_DURATION_MS,
  POST_VIDEO_MAX_PER_DAY,
  subscribeCaptureRetake,
  useCanPostVideoToday,
} from '@/features/posts';
import { useCameraRides, usePersistedSelectedRideId } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { colors, radius, spacing } from '@/theme';

type Facing = 'back' | 'front';
type CaptureMode = 'photo' | 'video';

const absoluteFill = {
  bottom: 0,
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
} as const;

/** Native tab bar sits above the home indicator; safe-area bottom alone
 * doesn't clear the bar when chrome is absolutely positioned. */
const TAB_BAR_CLEARANCE = POST_CAPTURE_TAB_BAR_CLEARANCE;
/** Recordings shorter than this are treated as an accidental tap. */
const MIN_VIDEO_RECORD_MS = 500;

export default function CameraScreen() {
  const {
    rideId: preferredRideIdParam,
    retake,
  } = useLocalSearchParams<{
    rideId?: string;
    retake?: string;
  }>();
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const cameraRides = useCameraRides(user?.id);
  const { selectedRideId: homeRideId, refresh: refreshHomeRide } =
    usePersistedSelectedRideId(user?.id);
  const preferredRideId = preferredRideIdParam ?? homeRideId ?? undefined;
  const videoQuota = useCanPostVideoToday();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  /** Keeps the preview up while permission is re-checked on focus (avoids a flash). */
  const cameraGrantedRef = useRef(false);
  if (permission?.granted) cameraGrantedRef.current = true;
  else if (permission && !permission.granted) cameraGrantedRef.current = false;
  const [focused, setFocused] = useState(false);
  const [facing, setFacing] = useState<Facing>('back');
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [torchOn, setTorchOn] = useState(false);
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<'capture' | 'gallery' | 'video' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [bootingCamera, setBootingCamera] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const recordingStartRef = useRef(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeRides = useMemo(() => cameraRides.data ?? [], [cameraRides.data]);
  const cameraAllowed = permission?.granted === true || cameraGrantedRef.current;

  useFocusEffect(
    useCallback(() => {
      refreshHomeRide();
      setFocused(true);
      // Do not clear cameraReady here — toggling `active` does not remount
      // CameraView, so onCameraReady often never fires again and the boot
      // spinner would spin forever when returning via the tab.
      // Only re-query when we don't already know it's granted — calling
      // getPermission() every focus can briefly clear status and flash the
      // "Camera access" panel when returning from publish.
      if (!cameraGrantedRef.current) {
        void getPermission();
      }
      return () => {
        setFocused(false);
        setTorchOn(false);
      };
    }, [getPermission, refreshHomeRide]),
  );

  // If onCameraReady never arrives (common when only `active` flips), unlock
  // controls so the tab isn't stuck behind the boot spinner.
  useEffect(() => {
    if (!focused || !cameraAllowed || cameraReady) return;
    const timeout = setTimeout(() => {
      setCameraReady(true);
      setBootingCamera(false);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [cameraAllowed, cameraReady, focused]);

  const markCameraBooting = useCallback(() => {
    setCameraReady(false);
    setBootingCamera(true);
  }, []);

  const markCameraReady = useCallback(() => {
    setCameraReady(true);
    setBootingCamera(false);
  }, []);

  const switchMode = useCallback(
    async (next: CaptureMode) => {
      if (next === mode || busy != null || isRecording) return;
      setTorchOn(false);
      setError(null);

      if (next === 'video') {
        if (!videoQuota.canPost) {
          toast.info(
            `You can only share ${POST_VIDEO_MAX_PER_DAY} videos per day. Try again tomorrow.`,
          );
          return;
        }
        // Mic must be granted before the native video session opens — otherwise
        // Android can hang with a frozen preview when RECORD_AUDIO is missing
        // or when the permission prompt interrupts mid-reconfigure.
        const currentMic = micPermission?.granted
          ? micPermission
          : await requestMicPermission();
        if (!currentMic.granted) {
          haptics.error();
          setError('Microphone access is needed to record video with sound.');
          return;
        }
      }

      markCameraBooting();
      setMode(next);
      haptics.selection();
    },
    [
      busy,
      isRecording,
      markCameraBooting,
      micPermission,
      mode,
      requestMicPermission,
      videoQuota.canPost,
    ],
  );

  const resetCapture = useCallback(() => {
    setDraftUri((current) => {
      deleteLocalMediaFile(current);
      return null;
    });
    setError(null);
  }, []);

  // Retake from publish clears the draft immediately so the pop reveals the
  // camera, not the editor, under the native back animation.
  useEffect(() => subscribeCaptureRetake(resetCapture), [resetCapture]);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  useEffect(() => stopElapsedTimer, [stopElapsedTimer]);

  // Retake deep-link (e.g. publish fallback when the stack can't pop).
  // Post-success goes straight to Rides via requestCaptureRetake + dismissTo.
  useEffect(() => {
    if (retake !== '1') return;
    resetCapture();
    router.setParams({ retake: undefined });
  }, [resetCapture, retake]);

  const takePhoto = async () => {
    if (!camera.current || busy || !cameraReady) return;
    setBusy('capture');
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        const framedUri = await cropImageToPostAspect(photo.uri);
        if (framedUri !== photo.uri) deleteLocalMediaFile(photo.uri);
        setDraftUri((previous) => {
          if (previous && previous !== framedUri) deleteLocalMediaFile(previous);
          return framedUri;
        });
        haptics.medium();
      }
    } catch {
      haptics.error();
      setError('The camera could not take a photo. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const chooseFromGallery = async () => {
    setBusy('gallery');
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPermission.granted) {
          haptics.error();
          setError('Photo library access was denied. You can still use the camera.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const sourceUri = result.assets[0].uri;
        const framedUri = await cropImageToPostAspect(sourceUri);
        if (framedUri !== sourceUri) deleteLocalMediaFile(sourceUri);
        setDraftUri((previous) => {
          if (previous && previous !== framedUri) deleteLocalMediaFile(previous);
          return framedUri;
        });
        haptics.light();
      }
    } catch {
      haptics.error();
      setError('The photo library could not open. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const openPublish = (imageUri: string) => {
    if (!draftUri) return;
    router.push({
      pathname: '/publish',
      params: {
        imageUri,
        ...(preferredRideId ? { rideId: preferredRideId } : {}),
      },
    });
  };

  const openPublishVideo = (videoUri: string, thumbnailUri: string, durationMs: number) => {
    router.push({
      pathname: '/publish',
      params: {
        imageUri: thumbnailUri,
        videoUri,
        videoDurationMs: String(durationMs),
        ...(preferredRideId ? { rideId: preferredRideId } : {}),
      },
    });
  };

  const startRecording = async () => {
    if (!camera.current || busy || isRecording || !cameraReady) return;
    if (!videoQuota.canPost) {
      toast.info(
        `You can only share ${POST_VIDEO_MAX_PER_DAY} videos per day. Try again tomorrow.`,
      );
      return;
    }
    setError(null);
    try {
      recordingStartRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      haptics.medium();
      stopElapsedTimer();
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - recordingStartRef.current);
      }, 100);

      const result = await camera.current.recordAsync({
        maxDuration: POST_VIDEO_MAX_DURATION_MS / 1000,
      });

      stopElapsedTimer();
      setIsRecording(false);
      const durationMs = Math.min(
        Date.now() - recordingStartRef.current,
        POST_VIDEO_MAX_DURATION_MS,
      );

      if (!result?.uri) return;
      if (durationMs < MIN_VIDEO_RECORD_MS) {
        deleteLocalMediaFile(result.uri);
        haptics.light();
        return;
      }

      setBusy('video');
      try {
        const thumbnailUri = await generatePostVideoThumbnail(result.uri);
        haptics.medium();
        openPublishVideo(result.uri, thumbnailUri, durationMs);
      } catch {
        deleteLocalMediaFiles(result.uri);
        haptics.error();
        setError('The video could not be prepared. Please try again.');
      } finally {
        setBusy(null);
      }
    } catch {
      stopElapsedTimer();
      setIsRecording(false);
      haptics.error();
      setError('The camera could not record a video. Please try again.');
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    camera.current?.stopRecording();
  };

  const onShutterPress = () => {
    if (mode === 'photo') {
      void takePhoto();
      return;
    }
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  };

  const askForCamera = async () => {
    setError(null);
    try {
      if (permission?.canAskAgain === false) {
        await Linking.openSettings();
        return;
      }
      const result = await requestPermission();
      if (!result.granted && result.canAskAgain === false) {
        setError('Camera access is blocked. Enable it in system Settings.');
      }
    } catch {
      setError('Camera permission could not be requested. Try again.');
    }
  };

  if (cameraRides.isPending) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <CenteredBusy message="Checking your Rides…" />
      </SafeAreaView>
    );
  }

  if (!activeRides.length) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Heading>No active Rides</Heading>
          <Body muted>
            Join or create an active Ride to share photos anytime.
          </Body>
          <View style={styles.emptyActions}>
            <Button onPress={() => router.push('/create-ride')}>Create a Ride</Button>
            <Button variant="secondary" onPress={() => router.push('/join-ride')}>
              Join with code
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (draftUri) {
    return (
      <PhotoTextEditor
        imageUri={draftUri}
        onCancel={resetCapture}
        onDone={openPublish}
        onSkip={() => openPublish(draftUri)}
      />
    );
  }

  const framePadding = getPostCaptureFramePadding(insets);

  return (
    <View style={styles.cameraRoot}>
      <View
        style={[
          styles.frameStage,
          {
            paddingBottom: framePadding.bottom,
            paddingHorizontal: framePadding.horizontal,
            paddingTop: framePadding.top,
          },
        ]}
      >
        <View
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setFrameSize(getPostFrameSize(width, height));
          }}
          style={styles.frameSlot}
        >
          <View
            collapsable={false}
            style={[
              styles.captureFrame,
              frameSize.width > 0
                ? { height: frameSize.height, width: frameSize.width }
                : null,
            ]}
          >
            {cameraAllowed ? (
              <>
                <CameraView
                  // Remount on mode/facing changes — mutating `mode` on a live
                  // CameraView can freeze the preview in production builds.
                  key={`${mode}-${facing}`}
                  active={focused}
                  enableTorch={mode === 'photo' && facing === 'back' && torchOn}
                  facing={facing}
                  mirror={facing === 'front'}
                  mode={mode === 'photo' ? 'picture' : 'video'}
                  mute={false}
                  onCameraReady={markCameraReady}
                  onMountError={() => {
                    setCameraReady(false);
                    setBootingCamera(false);
                    setError('The camera could not start. Switch mode or try again.');
                  }}
                  ref={camera}
                  style={styles.cameraPreview}
                  videoQuality="720p"
                />
                {focused && bootingCamera ? (
                  <View pointerEvents="none" style={styles.cameraBootOverlay}>
                    <ActivityIndicator color={colors.white} size="large" />
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.cameraFallback}>
                <Heading>Camera access</Heading>
                <Body muted>
                  {permission === null
                    ? 'Checking camera permission…'
                    : permission?.canAskAgain === false
                      ? 'Camera access is blocked for Rhodeo. Enable it in system Settings.'
                      : 'Camera access is off. Allow it, or choose a photo from your library.'}
                </Body>
                {permission != null ? (
                  <View style={styles.emptyActions}>
                    <Button onPress={() => void askForCamera()}>
                      {permission.canAskAgain === false ? 'Open Settings' : 'Allow camera'}
                    </Button>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </View>

      <SafeAreaView
        edges={['top', 'left', 'right']}
        pointerEvents="box-none"
        style={styles.cameraChrome}
      >
        <View pointerEvents="box-none" style={styles.topBar}>
          {mode === 'photo' && facing === 'back' ? (
            <GlassIconButton
              accessibilityLabel={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
              color={colors.white}
              dark
              disabled={!cameraAllowed}
              icon={torchOn ? 'flash' : 'flash-outline'}
              iconSize={20}
              onPress={() => {
                setTorchOn((current) => !current);
                haptics.selection();
              }}
              size={40}
            />
          ) : (
            <View style={styles.topBarSpacer} />
          )}
          <GlassIconButton
            accessibilityLabel="Flip camera"
            color={colors.white}
            dark
            disabled={!cameraAllowed || isRecording}
            icon="camera-reverse-outline"
            iconSize={22}
            onPress={() => {
              setTorchOn(false);
              markCameraBooting();
              setFacing((current) => (current === 'back' ? 'front' : 'back'));
            }}
            size={40}
          />
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + TAB_BAR_CLEARANCE },
          ]}
        >
          {isRecording ? (
            <View style={styles.recordingTimer}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTimerText}>
                {formatAudioDuration(elapsedMs / 1000)} /{' '}
                {formatAudioDuration(POST_VIDEO_MAX_DURATION_MS / 1000)}
              </Text>
            </View>
          ) : (
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                disabled={busy != null || isRecording}
                onPress={() => void switchMode('photo')}
                style={({ pressed }) => [
                  styles.modeChip,
                  mode === 'photo' && styles.modeChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.modeChipText, mode === 'photo' && styles.modeChipTextSelected]}>
                  Photo
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy != null || isRecording}
                onPress={() => void switchMode('video')}
                style={({ pressed }) => [
                  styles.modeChip,
                  mode === 'video' && styles.modeChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.modeChipText, mode === 'video' && styles.modeChipTextSelected]}>
                  Video
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.shutterRow}>
            {mode === 'photo' ? (
              <GlassIconButton
                accessibilityLabel="Choose from gallery"
                color={colors.white}
                dark
                disabled={busy === 'gallery'}
                icon="images-outline"
                iconSize={22}
                onPress={() => void chooseFromGallery()}
                size={48}
              />
            ) : (
              <View style={styles.galleryButton} />
            )}

            <Pressable
              accessibilityLabel={
                mode === 'photo' ? 'Take photo' : isRecording ? 'Stop recording' : 'Record video'
              }
              accessibilityRole="button"
              disabled={
                !cameraAllowed || !cameraReady || busy === 'capture' || busy === 'video'
              }
              onPress={onShutterPress}
              style={({ pressed }) => [
                styles.shutterOuter,
                mode === 'video' && styles.shutterOuterVideo,
                isRecording && styles.shutterOuterRecording,
                pressed && styles.pressed,
                (!cameraAllowed ||
                  !cameraReady ||
                  busy === 'capture' ||
                  busy === 'video') &&
                  styles.disabled,
              ]}
            >
              <View
                style={[
                  styles.shutterInner,
                  mode === 'video' && styles.shutterInnerVideo,
                  isRecording && styles.shutterInnerRecording,
                ]}
              >
                {busy === 'capture' || busy === 'video' ? (
                  <ActivityIndicator color={colors.primary} />
                ) : null}
              </View>
            </Pressable>

            <View style={styles.galleryButton} />
          </View>
        </View>
      </SafeAreaView>

      {error ? (
        <View
          style={[
            styles.errorOverlay,
            { bottom: 110 + insets.bottom + TAB_BAR_CLEARANCE },
          ]}
        >
          <ErrorBanner message={error} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  emptyState: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  emptyActions: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  cameraRoot: { backgroundColor: '#000', flex: 1 },
  frameStage: {
    ...absoluteFill,
  },
  frameSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  captureFrame: {
    backgroundColor: '#000',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  cameraPreview: {
    ...absoluteFill,
  },
  cameraBootOverlay: {
    ...absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
  },
  cameraFallback: {
    ...absoluteFill,
    backgroundColor: colors.background,
    gap: spacing.md,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  cameraChrome: {
    ...absoluteFill,
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  topBarSpacer: {
    height: 28,
    width: 28,
  },
  bottomBar: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modeChipSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  modeChipText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  modeChipTextSelected: { color: colors.white },
  recordingTimer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  recordingDot: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  recordingTimerText: {
    color: colors.white,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  shutterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  galleryButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  shutterOuter: {
    alignItems: 'center',
    borderColor: colors.white,
    borderRadius: 40,
    borderWidth: 4,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  shutterOuterVideo: {
    borderColor: colors.danger,
  },
  shutterOuterRecording: {
    borderColor: colors.danger,
  },
  shutterInner: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  shutterInnerVideo: {
    backgroundColor: colors.danger,
  },
  shutterInnerRecording: {
    borderRadius: 12,
    height: 32,
    width: 32,
  },
  errorOverlay: {
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
