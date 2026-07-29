import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { PhotoTextEditor } from '@/components/photo-text-editor';
import {
  Button,
  ErrorBanner,
  Field,
  StatePanel,
} from '@/components/ui';
import { useSoloRideNotifications } from '@/features/notifications';
import {
  getOptionalForegroundLocation,
  searchLocations,
  useCreatePost,
  type LocationSuggestion,
} from '@/features/posts';
import { useRidesDueToday, type DueTodayRide } from '@/features/rides';
import { colors, radius, shadows, spacing } from '@/theme';

type Facing = 'back' | 'front';

/** Native tab bar sits above the home indicator; safe-area bottom alone
 * doesn't clear the bar when chrome is absolutely positioned. */
const TAB_BAR_CLEARANCE = 56;

export default function CameraScreen() {
  const { rideId: preferredRideId } = useLocalSearchParams<{ rideId?: string }>();
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const due = useRidesDueToday(user?.id);
  const createPost = useCreatePost();
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [focused, setFocused] = useState(true);
  const [facing, setFacing] = useState<Facing>('back');
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [busy, setBusy] = useState<'capture' | 'gallery' | 'location' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rideMenuOpen, setRideMenuOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const skipLocationSearch = useRef(false);
  const composeScroll = useRef<ScrollView>(null);

  const postableRides = useMemo(() => due.data?.postableRides ?? [], [due.data?.postableRides]);
  const selectedRide = useMemo(
    () => postableRides.find((ride) => ride.id === selectedRideId) ?? null,
    [postableRides, selectedRideId],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!postableRides.length) {
      setSelectedRideId(null);
      return;
    }
    setSelectedRideId((current) => {
      if (current && postableRides.some((ride) => ride.id === current)) return current;
      if (preferredRideId && postableRides.some((ride) => ride.id === preferredRideId)) {
        return preferredRideId;
      }
      if (postableRides.length === 1) return postableRides[0]!.id;
      return null;
    });
  }, [postableRides, preferredRideId]);

  useEffect(() => {
    if (skipLocationSearch.current) {
      skipLocationSearch.current = false;
      return;
    }
    if (selectedLocation) return;

    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationSuggestions([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        setBusy('search');
        try {
          const results = await searchLocations(query);
          if (!cancelled) setLocationSuggestions(results);
        } catch {
          if (!cancelled) setLocationSuggestions([]);
        } finally {
          if (!cancelled) setBusy((current) => (current === 'search' ? null : current));
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [locationQuery, selectedLocation]);

  const resetCapture = () => {
    setDraftUri(null);
    setImageUri(null);
    setDescription('');
    setLocationQuery('');
    setSelectedLocation(null);
    setLocationSuggestions([]);
    setRideMenuOpen(false);
    setError(null);
  };

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy('capture');
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        setDraftUri(photo.uri);
        setImageUri(null);
      }
    } catch {
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
          setError('Photo library access was denied. You can still use the camera.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setDraftUri(result.assets[0].uri);
        setImageUri(null);
      }
    } catch {
      setError('The photo library could not open. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const updateLocationQuery = (text: string) => {
    setLocationQuery(text);
    setSelectedLocation(null);
  };

  const pickLocationSuggestion = (suggestion: LocationSuggestion) => {
    skipLocationSearch.current = true;
    setSelectedLocation(suggestion);
    setLocationQuery(suggestion.locationName);
    setLocationSuggestions([]);
  };

  const applyCurrentLocation = async () => {
    setBusy('location');
    setError(null);
    setLocationSuggestions([]);
    const nextLocation = await getOptionalForegroundLocation();
    if (nextLocation.status === 'available') {
      const suggestion: LocationSuggestion = {
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
        locationName: nextLocation.locationName || 'Current location',
      };
      skipLocationSearch.current = true;
      setSelectedLocation(suggestion);
      setLocationQuery(suggestion.locationName);
    } else if (nextLocation.status === 'denied') {
      setError('Location access was denied. Search or type a place instead.');
    } else {
      setError('Location is unavailable. Search or type a place instead.');
    }
    setBusy(null);
  };

  const publish = async () => {
    const ride = postableRides.find((entry) => entry.id === selectedRideId);
    if (!imageUri || !ride) return;
    setError(null);
    try {
      const typedName = locationQuery.trim() || null;
      await createPost.mutateAsync({
        rideId: ride.id,
        imageUri,
        description,
        scheduledDate: ride.scheduledToday,
        latitude: selectedLocation?.latitude ?? null,
        longitude: selectedLocation?.longitude ?? null,
        locationName: selectedLocation?.locationName ?? typedName,
      });
      await notifications.onPostCreated(ride.id, ride.scheduledToday).catch(() => []);
      resetCapture();
      // NativeTabs needs navigate (NAVIGATE), not replace, to leave Camera for Rides.
      router.navigate({ pathname: '/', params: { selectRideId: ride.id } });

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photo could not be published.');
    }
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

  if (due.isPending) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatePanel loading message="Checking today’s Rides…" />
      </SafeAreaView>
    );
  }

  if (!postableRides.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyWrap}>
          <StatePanel
            message="No Ride is waiting for a photo today. Come back on a scheduled day."
            title="Nothing due today"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (draftUri && !imageUri) {
    return (
      <PhotoTextEditor
        imageUri={draftUri}
        onCancel={resetCapture}
        onDone={(uri) => {
          setImageUri(uri);
          setDraftUri(null);
        }}
        onSkip={() => {
          setImageUri(draftUri);
          setDraftUri(null);
        }}
      />
    );
  }

  if (imageUri) {
    const locationHint = selectedLocation
      ? null
      : locationQuery.trim().length >= 2 && !locationSuggestions.length && busy !== 'search'
        ? 'No matches — will post as a typed label.'
        : locationQuery.trim() && !selectedLocation
          ? 'Pick a suggestion above or keep typing.'
          : null;

    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.flex}>
          <View style={styles.composeTopBar}>
            <Text style={styles.composeTitle}>New photo</Text>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={[
              styles.composeContent,
              { paddingBottom: spacing.xl + 72 },
            ]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            ref={composeScroll}
            style={styles.flex}
          >
            <View style={styles.previewFrame}>
              <Image resizeMode="cover" source={{ uri: imageUri }} style={styles.preview} />
              <Pressable
                accessibilityLabel="Retake or choose another photo"
                accessibilityRole="button"
                onPress={resetCapture}
                style={({ pressed }) => [styles.previewRetake, pressed && styles.pressed]}
              >
                <Ionicons color={colors.white} name="refresh" size={16} />
                <Text style={styles.previewRetakeText}>Retake</Text>
              </Pressable>
            </View>

            <View style={styles.composeForm}>
              <View style={styles.postToBlock}>
                <Text style={styles.sectionLabel}>Post to</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRideMenuOpen((open) => !open)}
                  style={({ pressed }) => [styles.rideDropdownTrigger, pressed && styles.pressed]}
                >
                  <View style={styles.rideDropdownTriggerText}>
                    <Text numberOfLines={1} style={styles.rideName}>
                      {selectedRide?.name ?? 'Choose a Ride'}
                    </Text>
                    {selectedRide ? (
                      <View
                        style={[
                          styles.rideBadge,
                          selectedRide.isRequiredToday
                            ? styles.rideBadgeDue
                            : styles.rideBadgeOptional,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rideBadgeText,
                            selectedRide.isRequiredToday
                              ? styles.rideBadgeTextDue
                              : styles.rideBadgeTextOptional,
                          ]}
                        >
                          {selectedRide.isRequiredToday ? 'Due today' : 'Optional'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons
                    color={colors.muted}
                    name={rideMenuOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                  />
                </Pressable>
                {rideMenuOpen ? (
                  <View style={styles.rideDropdownPanel}>
                    {postableRides.map((ride) => (
                      <RideOption
                        key={ride.id}
                        onPress={() => {
                          setSelectedRideId(ride.id);
                          setRideMenuOpen(false);
                        }}
                        ride={ride}
                        selected={selectedRideId === ride.id}
                      />
                    ))}
                  </View>
                ) : null}
              </View>

              <Field
                autoCapitalize="sentences"
                label="Caption"
                maxLength={2000}
                multiline
                onChangeText={setDescription}
                onFocus={() => {
                  setRideMenuOpen(false);
                  setTimeout(() => composeScroll.current?.scrollToEnd({ animated: true }), 100);
                }}
                placeholder="A small moment from today…"
                style={styles.description}
                value={description}
              />

              <View style={styles.locationBlock}>
                <Text style={styles.sectionLabel}>Location</Text>

                {locationSuggestions.length ? (
                  <View style={styles.suggestionList}>
                    {locationSuggestions.map((suggestion) => (
                      <Pressable
                        key={`${suggestion.latitude},${suggestion.longitude},${suggestion.locationName}`}
                        accessibilityRole="button"
                        onPress={() => pickLocationSuggestion(suggestion)}
                        style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
                      >
                        <Ionicons color={colors.primary} name="location-outline" size={18} />
                        <Text numberOfLines={2} style={styles.suggestionText}>
                          {suggestion.locationName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {selectedLocation ? (
                  <View style={styles.pinnedChip}>
                    <Ionicons color={colors.primary} name="navigate" size={14} />
                    <Text numberOfLines={1} style={styles.pinnedChipText}>
                      {selectedLocation.locationName}
                    </Text>
                    <Pressable
                      accessibilityLabel="Clear location"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        setSelectedLocation(null);
                        setLocationQuery('');
                      }}
                    >
                      <Ionicons color={colors.muted} name="close-circle" size={18} />
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.locationInputRow}>
                  <View style={styles.locationFieldWrap}>
                    <Field
                      autoCapitalize="words"
                      maxLength={200}
                      onChangeText={updateLocationQuery}
                      onFocus={() => {
                        setRideMenuOpen(false);
                        setTimeout(
                          () => composeScroll.current?.scrollToEnd({ animated: true }),
                          100,
                        );
                      }}
                      placeholder="Search or type a place"
                      returnKeyType="done"
                      value={locationQuery}
                    />
                  </View>
                  <Pressable
                    accessibilityLabel="Use current location"
                    accessibilityRole="button"
                    disabled={busy === 'location'}
                    onPress={() => void applyCurrentLocation()}
                    style={({ pressed }) => [
                      styles.locateButton,
                      pressed && styles.pressed,
                      busy === 'location' && styles.disabled,
                    ]}
                  >
                    {busy === 'location' || busy === 'search' ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons color={colors.primary} name="locate" size={22} />
                    )}
                  </Pressable>
                </View>

                {locationHint ? <Text style={styles.hint}>{locationHint}</Text> : null}
              </View>

              <ErrorBanner message={error} />
            </View>
          </ScrollView>

          <View
            style={[
              styles.composeFooter,
              {
                paddingBottom:
                  keyboardHeight > 0
                    ? keyboardHeight + spacing.sm
                    : Math.max(insets.bottom, spacing.sm) + TAB_BAR_CLEARANCE,
              },
            ]}
          >
            <Button
              disabled={!selectedRideId || busy === 'location'}
              loading={createPost.isPending}
              onPress={() => void publish()}
            >
              Publish
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraRoot}>
      {permission?.granted && focused ? (
        <CameraView
          active={focused}
          facing={facing}
          ref={camera}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraFallback]}>
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

function RideOption({
  ride,
  selected,
  onPress,
}: {
  ride: DueTodayRide;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.rideOption,
        selected && styles.rideOptionSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rideOptionText}>
        <Text numberOfLines={1} style={styles.rideName}>
          {ride.name}
        </Text>
        <Text style={ride.isRequiredToday ? styles.rideDue : styles.rideOptional}>
          {ride.isRequiredToday ? 'Due today' : 'Optional today'}
        </Text>
      </View>
      {selected ? <Ionicons color={colors.primary} name="checkmark" size={18} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  cameraRoot: { backgroundColor: '#000', flex: 1 },
  cameraFallback: {
    alignItems: 'center',
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cameraChrome: { flex: 1, justifyContent: 'space-between' },
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
    backgroundColor: colors.white,
    borderRadius: 32,
    height: 64,
    width: 64,
  },
  errorOverlay: {
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  composeTopBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  composeTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  composeContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  previewFrame: {
    alignSelf: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: '72%',
    ...shadows.card,
  },
  preview: {
    aspectRatio: 3 / 4,
    width: '100%',
  },
  previewRetake: {
    alignItems: 'center',
    backgroundColor: 'rgba(28, 41, 34, 0.72)',
    borderRadius: radius.pill,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xxs,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  previewRetakeText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  composeForm: { gap: spacing.lg },
  sectionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  postToBlock: { gap: spacing.xs, zIndex: 2 },
  rideDropdownTrigger: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rideDropdownTriggerText: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rideDropdownPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xxs,
    overflow: 'hidden',
    padding: spacing.xs,
    ...shadows.floating,
  },
  rideOption: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rideOptionSelected: { backgroundColor: colors.primarySoft },
  rideOptionText: { flex: 1, gap: 2 },
  rideName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rideDue: { color: colors.accentPressed, fontSize: 12, fontWeight: '700' },
  rideOptional: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  rideBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  rideBadgeDue: { backgroundColor: colors.accentSoft },
  rideBadgeOptional: { backgroundColor: colors.surfaceMuted },
  rideBadgeText: { fontSize: 11, fontWeight: '700' },
  rideBadgeTextDue: { color: colors.accentPressed },
  rideBadgeTextOptional: { color: colors.muted },
  description: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  locationBlock: { gap: spacing.xs },
  locationInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  locationFieldWrap: { flex: 1 },
  locateButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  pinnedChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xxs + 2,
  },
  pinnedChipText: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  suggestionList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  suggestionRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, fontWeight: '500', marginTop: 2 },
  composeFooter: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
