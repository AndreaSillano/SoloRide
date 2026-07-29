import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
import {
  MAX_ACTIVE_TEMPORARY_POSTS,
  useCameraRides,
  type CameraRide,
} from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type Facing = 'back' | 'front';

/** Native tab bar sits above the home indicator; safe-area bottom alone
 * doesn't clear the bar when chrome is absolutely positioned. */
const TAB_BAR_CLEARANCE = 56;
/** Publish button + vertical padding when the keyboard is open. */
const PUBLISH_BAR_HEIGHT = spacing.sm + 54 + spacing.sm;
/** Extra scroll clearance above the sticky publish bar while typing. */
const KEYBOARD_SCROLL_EXTRA = spacing.xl + spacing.md;

export default function CameraScreen() {
  const { rideId: preferredRideId } = useLocalSearchParams<{ rideId?: string }>();
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const cameraRides = useCameraRides(user?.id);
  const createPost = useCreatePost();
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [focused, setFocused] = useState(true);
  const [facing, setFacing] = useState<Facing>('back');
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selectedRideIds, setSelectedRideIds] = useState<string[]>([]);
  const [wantTemporary, setWantTemporary] = useState(false);
  const [description, setDescription] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [busy, setBusy] = useState<'capture' | 'gallery' | 'location' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rideMenuOpen, setRideMenuOpen] = useState(false);
  const skipLocationSearch = useRef(false);
  const initializedRideSelection = useRef(false);

  const activeRides = useMemo(() => cameraRides.data ?? [], [cameraRides.data]);
  const permanentEligible = useMemo(
    () => activeRides.filter((ride) => ride.canPublishPermanent),
    [activeRides],
  );
  const temporaryEligible = useMemo(
    () => activeRides.filter((ride) => ride.temporaryRemaining > 0),
    [activeRides],
  );
  const canChoosePermanent = permanentEligible.length > 0;
  const isTemporary = !canChoosePermanent || wantTemporary;
  const selectableRides = isTemporary ? temporaryEligible : permanentEligible;
  const selectedRides = useMemo(
    () => selectableRides.filter((ride) => selectedRideIds.includes(ride.id)),
    [selectableRides, selectedRideIds],
  );
  const primaryRide = selectedRides[0] ?? null;
  const canShareTemporary = Boolean(
    isTemporary && selectedRides.length === 1 && selectedRides[0]!.temporaryRemaining > 0,
  );
  const canPublish = isTemporary
    ? canShareTemporary
    : selectedRides.length > 0 &&
      selectedRides.every((ride) => ride.canPublishPermanent);

  const defaultPermanentRideIds = useCallback(() => {
    const required = permanentEligible
      .filter((ride) => ride.isRequiredToday)
      .map((ride) => ride.id);
    const preferred =
      preferredRideId && permanentEligible.some((ride) => ride.id === preferredRideId)
        ? [preferredRideId]
        : [];
    const ids = [...new Set([...required, ...preferred])];
    if (ids.length) return ids;
    if (permanentEligible.length === 1) return [permanentEligible[0]!.id];
    return [];
  }, [permanentEligible, preferredRideId]);

  const defaultTemporaryRideId = useCallback(() => {
    if (preferredRideId && temporaryEligible.some((ride) => ride.id === preferredRideId)) {
      return preferredRideId;
    }
    if (temporaryEligible.length === 1) return temporaryEligible[0]!.id;
    return null;
  }, [preferredRideId, temporaryEligible]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Permission may have been granted during sign-in onboarding via
      // requestCoreAppPermissions(); refresh so this tab picks that up.
      void getPermission();
      return () => setFocused(false);
    }, [getPermission]),
  );

  useEffect(() => {
    if (!activeRides.length) {
      setSelectedRideIds([]);
      setWantTemporary(false);
      initializedRideSelection.current = false;
      return;
    }

    if (!canChoosePermanent) {
      setWantTemporary(true);
    }

    setSelectedRideIds((current) => {
      if (isTemporary) {
        const stillValid = current.filter((id) =>
          temporaryEligible.some((ride) => ride.id === id),
        );
        if (stillValid.length) return [stillValid[0]!];
        if (initializedRideSelection.current) return [];
        initializedRideSelection.current = true;
        const fallback = defaultTemporaryRideId();
        return fallback ? [fallback] : [];
      }

      const stillValid = current.filter((id) =>
        permanentEligible.some((ride) => ride.id === id),
      );
      if (initializedRideSelection.current) return stillValid;
      initializedRideSelection.current = true;
      return defaultPermanentRideIds();
    });
  }, [
    activeRides.length,
    canChoosePermanent,
    defaultPermanentRideIds,
    defaultTemporaryRideId,
    isTemporary,
    permanentEligible,
    temporaryEligible,
  ]);

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
    setWantTemporary(!canChoosePermanent);
    setError(null);
  };

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy('capture');
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        haptics.medium();
        setDraftUri(photo.uri);
        setImageUri(null);
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
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        haptics.light();
        setDraftUri(result.assets[0].uri);
        setImageUri(null);
      }
    } catch {
      haptics.error();
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
    if (!imageUri || !primaryRide || !canPublish || !selectedRides.length) return;
    setError(null);
    try {
      const typedName = locationQuery.trim() || null;
      await createPost.mutateAsync({
        rideIds: selectedRides.map((ride) => ride.id),
        imageUri,
        description,
        scheduledDate: primaryRide.postDate,
        isTemporary,
        latitude: selectedLocation?.latitude ?? null,
        longitude: selectedLocation?.longitude ?? null,
        locationName: selectedLocation?.locationName ?? typedName,
      });
      if (!isTemporary) {
        await Promise.all(
          selectedRides
            .filter((ride) => ride.scheduledToday)
            .map((ride) =>
              notifications.onPostCreated(ride.id, ride.scheduledToday!).catch(() => []),
            ),
        );
      }
      haptics.success();
      resetCapture();
      // NativeTabs needs navigate (NAVIGATE), not replace, to leave Camera for Rides.
      router.navigate({ pathname: '/', params: { selectRideId: primaryRide.id } });
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'The photo could not be published.');
    }
  };

  const togglePermanentRide = (rideId: string) => {
    setSelectedRideIds((current) =>
      current.includes(rideId)
        ? current.filter((id) => id !== rideId)
        : [...current, rideId],
    );
  };

  const selectTemporaryRide = (rideId: string) => {
    setSelectedRideIds([rideId]);
    setRideMenuOpen(false);
  };

  const choosePermanent = () => {
    setWantTemporary(false);
    setRideMenuOpen(false);
    setSelectedRideIds((current) => {
      const stillValid = current.filter((id) =>
        permanentEligible.some((ride) => ride.id === id),
      );
      return stillValid.length ? stillValid : defaultPermanentRideIds();
    });
  };

  const chooseTemporary = () => {
    setWantTemporary(true);
    setRideMenuOpen(false);
    setSelectedRideIds((current) => {
      const stillValid = current.find((id) =>
        temporaryEligible.some((ride) => ride.id === id),
      );
      if (stillValid) return [stillValid];
      const fallback = defaultTemporaryRideId();
      return fallback ? [fallback] : [];
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

    const footerPad = Math.max(insets.bottom, spacing.sm);
    const temporaryForced = !canChoosePermanent;
    const temporaryHint = temporaryForced
      ? null
      : isTemporary
        ? 'Lasts 24 hours and doesn’t count as today’s publication.'
        : selectedRides.length > 1
          ? 'Same photo on each selected Ride. Counts as today’s publication for each.'
          : 'Stays in the feed and counts as today’s publication.';
    const composeTitle = temporaryForced
      ? '24-hour share'
      : isTemporary
        ? '24h photo'
        : 'New photo';
    const publishLabel = temporaryForced
      ? canShareTemporary
        ? 'Share for 24 hours'
        : 'No 24h shares left'
      : isTemporary
        ? 'Share for 24h'
        : selectedRides.length > 1
          ? `Publish to ${selectedRides.length} Rides`
          : 'Publish';
    const tempAvailability =
      isTemporary && primaryRide
        ? `${primaryRide.temporaryRemaining}/${MAX_ACTIVE_TEMPORARY_POSTS} available`
        : null;
    const rideTriggerLabel = isTemporary
      ? (primaryRide?.name ?? 'Choose a Ride')
      : selectedRides.length === 0
        ? 'Choose Rides'
        : selectedRides.length === 1
          ? selectedRides[0]!.name
          : `${selectedRides.length} Rides selected`;

    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.flex}>
          <View style={styles.composeTopBar}>
            <Text style={styles.composeTitle}>{composeTitle}</Text>
          </View>

          <KeyboardAwareScrollView
            bottomOffset={PUBLISH_BAR_HEIGHT + KEYBOARD_SCROLL_EXTRA + footerPad}
            contentContainerStyle={[
              styles.composeContent,
              {
                paddingBottom:
                  spacing.xl +
                  PUBLISH_BAR_HEIGHT +
                  footerPad +
                  TAB_BAR_CLEARANCE +
                  KEYBOARD_SCROLL_EXTRA,
              },
            ]}
            extraKeyboardSpace={KEYBOARD_SCROLL_EXTRA}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => setRideMenuOpen(false)}
            style={styles.flex}
          >
            {rideMenuOpen ? (
              <Pressable
                accessibilityLabel="Dismiss ride menu"
                accessibilityRole="button"
                onPress={() => setRideMenuOpen(false)}
                style={styles.rideMenuBackdrop}
              />
            ) : null}
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
            {isTemporary ? (
              <Text style={styles.tempPreviewHint}>
                This photo will disappear from the feed after 24 hours.
              </Text>
            ) : null}

            <View style={rideMenuOpen ? styles.rideMenuForeground : styles.composeFormTop}>
              {canChoosePermanent ? (
                <View style={styles.modeBlock}>
                  <Text style={styles.sectionLabel}>Post type</Text>
                  <View style={styles.modeRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={choosePermanent}
                      style={({ pressed }) => [
                        styles.modeChip,
                        !wantTemporary && styles.modeChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          !wantTemporary && styles.modeChipTextSelected,
                        ]}
                      >
                        Permanent
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!temporaryEligible.length}
                      onPress={chooseTemporary}
                      style={({ pressed }) => [
                        styles.modeChip,
                        wantTemporary && styles.modeChipSelected,
                        pressed && styles.pressed,
                        !temporaryEligible.length && styles.disabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          wantTemporary && styles.modeChipTextSelected,
                        ]}
                      >
                        24 hours
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.postToBlock}>
                <View style={styles.postToLabelRow}>
                  <Text style={styles.sectionLabel}>
                    {isTemporary ? 'Post to' : 'Post to Rides'}
                  </Text>
                  {tempAvailability ? (
                    <Text style={styles.captionMeta}>{tempAvailability}</Text>
                  ) : !isTemporary && permanentEligible.length > 1 ? (
                    <Text style={styles.captionMeta}>select one or more</Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRideMenuOpen((open) => !open)}
                  style={({ pressed }) => [styles.rideDropdownTrigger, pressed && styles.pressed]}
                >
                  <View style={styles.rideDropdownTriggerText}>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rideName}>
                      {rideTriggerLabel}
                    </Text>
                    {isTemporary && primaryRide ? (
                      <View style={[styles.rideBadge, styles.rideBadgeOptional]}>
                        <Ionicons color={colors.muted} name="time-outline" size={14} />
                      </View>
                    ) : !isTemporary && selectedRides.length > 0 ? (
                      <View style={[styles.rideBadge, styles.rideBadgeDue]}>
                        <Ionicons color={colors.accent} name="camera" size={14} />
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
                    <ScrollView
                      bounces={false}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      style={styles.rideDropdownScroll}
                    >
                      {(isTemporary ? temporaryEligible : permanentEligible).map((ride) => (
                        <RideOption
                          key={ride.id}
                          onPress={() =>
                            isTemporary
                              ? selectTemporaryRide(ride.id)
                              : togglePermanentRide(ride.id)
                          }
                          ride={ride}
                          selected={selectedRideIds.includes(ride.id)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.composeForm}>
              {temporaryHint ? <Text style={styles.hint}>{temporaryHint}</Text> : null}

              <View style={styles.captionBlock}>
                <View style={styles.captionLabelRow}>
                  <Text style={styles.sectionLabel}>Caption</Text>
                  <Text style={styles.captionMeta}>optional</Text>
                </View>
                <Field
                  autoCapitalize="sentences"
                  maxLength={50}
                  multiline
                  onChangeText={setDescription}
                  onFocus={() => setRideMenuOpen(false)}
                  placeholder="A small moment from today…"
                  style={styles.description}
                  value={description}
                />
                <Text style={styles.captionCounter}>{description.length}/50</Text>
              </View>

              <View style={styles.locationBlock}>
                <View style={styles.captionLabelRow}>
                  <Text style={styles.sectionLabel}>Location</Text>
                  <Text style={styles.captionMeta}>optional</Text>
                </View>

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
                      onFocus={() => setRideMenuOpen(false)}
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
          </KeyboardAwareScrollView>

          <KeyboardStickyView
            offset={{ closed: -TAB_BAR_CLEARANCE, opened: 0 }}
            style={styles.composeFooterSticky}
          >
            <View style={[styles.composeFooter, { paddingBottom: footerPad }]}>
              <Button
                disabled={!selectedRides.length || !canPublish || busy === 'location'}
                loading={createPost.isPending}
                onPress={() => void publish()}
              >
                {publishLabel}
              </Button>
            </View>
          </KeyboardStickyView>
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
          mirror={facing === 'front'}
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
  ride: CameraRide;
  selected: boolean;
  onPress: () => void;
}) {
  const statusLabel = ride.canPublishPermanent
    ? ride.isRequiredToday
      ? 'Photo due today'
      : 'Optional today'
    : '24h photos only';

  return (
    <Pressable
      accessibilityLabel={`${ride.name}, ${statusLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.rideOption,
        selected && styles.rideOptionSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rideName}>
        {ride.name}
      </Text>
      <View
        style={[
          styles.rideStatusChip,
          ride.canPublishPermanent ? styles.rideBadgeDue : styles.rideBadgeOptional,
        ]}
      >
        <Ionicons
          color={ride.canPublishPermanent ? colors.accent : colors.muted}
          name={ride.canPublishPermanent ? 'camera' : 'time-outline'}
          size={16}
        />
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
    position: 'relative',
  },
  rideMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  previewFrame: {
    alignSelf: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: '92%',
    ...shadows.card,
  },
  preview: {
    aspectRatio: 3 / 4,
    width: '100%',
  },
  tempPreviewHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: -spacing.sm,
    textAlign: 'center',
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
  composeFormTop: { gap: spacing.lg },
  rideMenuForeground: { gap: spacing.lg, zIndex: 2 },
  sectionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  postToBlock: { gap: spacing.xs },
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
    overflow: 'hidden',
    padding: spacing.xs,
    ...shadows.floating,
  },
  rideDropdownScroll: {
    maxHeight: 220,
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
  rideName: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  rideStatusChip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  rideBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  rideBadgeDue: { backgroundColor: colors.accentSoft },
  rideBadgeOptional: { backgroundColor: colors.surfaceMuted },
  modeBlock: { gap: spacing.xs },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modeChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  modeChipText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  modeChipTextSelected: { color: colors.primary },
  captionBlock: { gap: spacing.xs },
  captionLabelRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  postToLabelRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  captionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  captionCounter: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
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
  composeFooterSticky: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
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
