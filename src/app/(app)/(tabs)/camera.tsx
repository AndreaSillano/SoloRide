import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { PhotoTextEditor } from '@/components/photo-text-editor';
import {
  ErrorBanner,
  StatePanel,
} from '@/components/ui';
import {
  cropImageToPostAspect,
  getPostCaptureFramePadding,
  getPostFrameSize,
  POST_CAPTURE_TAB_BAR_CLEARANCE,
  subscribeCaptureRetake,
} from '@/features/posts';
import { useCameraRides } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

type Facing = 'back' | 'front';

/** Native tab bar sits above the home indicator; safe-area bottom alone
 * doesn't clear the bar when chrome is absolutely positioned. */
const TAB_BAR_CLEARANCE = POST_CAPTURE_TAB_BAR_CLEARANCE;

export default function CameraScreen() {
  const {
    rideId: preferredRideId,
    retake,
    selectRideId,
  } = useLocalSearchParams<{
    rideId?: string;
    retake?: string;
    selectRideId?: string;
  }>();
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const cameraRides = useCameraRides(user?.id);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [focused, setFocused] = useState(true);
  const [facing, setFacing] = useState<Facing>('back');
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<'capture' | 'gallery' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const activeRides = useMemo(() => cameraRides.data ?? [], [cameraRides.data]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Permission may have been granted during sign-in onboarding via
      // requestCoreAppPermissions(); refresh so this tab picks that up.
      void getPermission();
      return () => setFocused(false);
    }, [getPermission]),
  );

  const resetCapture = useCallback(() => {
    setDraftUri(null);
    setError(null);
  }, []);

  // Retake from publish clears the draft immediately so the pop reveals the
  // camera, not the editor, under the native back animation.
  useEffect(() => subscribeCaptureRetake(resetCapture), [resetCapture]);

  useEffect(() => {
    if (retake !== '1') return;
    resetCapture();
    router.setParams({ retake: undefined, selectRideId: undefined });
    if (selectRideId) {
      // NativeTabs needs navigate (NAVIGATE), not replace, to leave Camera for Rides.
      router.navigate({ pathname: '/', params: { selectRideId } });
    }
  }, [resetCapture, retake, selectRideId]);

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy('capture');
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        const framedUri = await cropImageToPostAspect(photo.uri);
        haptics.medium();
        setDraftUri(framedUri);
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
        const framedUri = await cropImageToPostAspect(result.assets[0].uri);
        haptics.light();
        setDraftUri(framedUri);
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
        <StatePanel loading message="Checking your Rides…" />
      </SafeAreaView>
    );
  }

  if (!activeRides.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyWrap}>
          <StatePanel
            message="Join or create an active Ride to share photos anytime."
            title="No active Rides"
          />
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
            {permission?.granted && focused ? (
              <CameraView
                active={focused}
                facing={facing}
                mirror={facing === 'front'}
                ref={camera}
                style={styles.cameraPreview}
              />
            ) : (
              <View style={styles.cameraFallback}>
                <StatePanel
                  actionLabel={
                    permission?.canAskAgain === false ? 'Open Settings' : 'Allow camera'
                  }
                  message={
                    permission === null
                      ? 'Checking camera permission…'
                      : permission?.canAskAgain === false
                        ? 'Camera access is blocked for SoloRide. Enable it in system Settings.'
                        : 'Camera access is off. Allow it, or choose a photo from your library.'
                  }
                  onAction={permission === null ? undefined : () => void askForCamera()}
                  title="Camera access"
                />
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
          <Pressable
            accessibilityLabel="Flip camera"
            accessibilityRole="button"
            disabled={!permission?.granted}
            hitSlop={10}
            onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons color={colors.white} name="camera-reverse-outline" size={28} />
          </Pressable>
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.bottomBar,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + TAB_BAR_CLEARANCE },
          ]}
        >
          <Pressable
            accessibilityLabel="Choose from gallery"
            accessibilityRole="button"
            disabled={busy === 'gallery'}
            onPress={() => void chooseFromGallery()}
            style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}
          >
            {busy === 'gallery' ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons color={colors.white} name="images-outline" size={26} />
            )}
          </Pressable>

          <Pressable
            accessibilityLabel="Take photo"
            accessibilityRole="button"
            disabled={!permission?.granted || busy === 'capture'}
            onPress={() => void takePhoto()}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && styles.pressed,
              (!permission?.granted || busy === 'capture') && styles.disabled,
            ]}
          >
            <View style={styles.shutterInner}>
              {busy === 'capture' ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
          </Pressable>

          <View style={styles.galleryButton} />
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
  emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  cameraRoot: { backgroundColor: '#000', flex: 1 },
  frameStage: {
    ...StyleSheet.absoluteFillObject,
  },
  frameSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  captureFrame: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cameraPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cameraChrome: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  bottomBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
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
  shutterInner: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  errorOverlay: {
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
