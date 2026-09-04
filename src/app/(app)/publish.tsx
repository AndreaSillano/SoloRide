import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import {
  AudioNotePreview,
  PublishAudioFooter,
} from '@/components/audio-note-recorder';
import { GlassSurface } from '@/components/glass';
import { LocationPickerModal } from '@/components/location-picker-modal';
import { PublishVideoPreview } from '@/components/publish-video-preview';
import { RidePickerModal } from '@/components/ride-picker-modal';
import { ErrorBanner } from '@/components/ui';
import { useActiveRideChallenges } from '@/features/challenges';
import { useSoloRideNotifications } from '@/features/notifications';
import {
  deleteLocalMediaFile,
  deleteLocalMediaFiles,
  getOptionalForegroundLocation,
  POST_IMAGE_ASPECT_RATIO,
  POST_VIDEO_MAX_PER_DAY,
  requestCaptureRetake,
  searchLocations,
  useCanPostVideoToday,
  useCreatePost,
  type LocationSuggestion,
} from '@/features/posts';
import {
  MAX_ACTIVE_TEMPORARY_POSTS,
  useCameraRides,
  usePersistedSelectedRideId,
} from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { colors, radius, shadows, spacing } from '@/theme';

/** Publish button + vertical padding when the keyboard is open. */
const PUBLISH_BAR_HEIGHT = spacing.sm + 62 + spacing.sm;
/** Extra scroll clearance above the sticky publish bar while typing. */
const KEYBOARD_SCROLL_EXTRA = spacing.xl + spacing.md;

export default function PublishScreen() {
  const {
    imageUri,
    videoUri,
    videoDurationMs: videoDurationMsParam,
    rideId: preferredRideIdParam,
  } = useLocalSearchParams<{
    imageUri?: string;
    videoUri?: string;
    videoDurationMs?: string;
    rideId?: string;
  }>();
  const hasVideo = Boolean(videoUri);
  const videoDurationMs = videoDurationMsParam ? Number(videoDurationMsParam) : null;
  const navigation = useNavigation();
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const cameraRides = useCameraRides(user?.id);
  const { selectedRideId: homeRideId } = usePersistedSelectedRideId(user?.id);
  const preferredRideId = preferredRideIdParam ?? homeRideId ?? undefined;
  const createPost = useCreatePost();
  const videoQuota = useCanPostVideoToday();
  const notifications = useSoloRideNotifications(user?.id ?? null);

  const [selectedRideIds, setSelectedRideIds] = useState<string[]>([]);
  const [wantTemporary, setWantTemporary] = useState(false);
  const [submitAsChallenge, setSubmitAsChallenge] = useState(false);
  const [description, setDescription] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [busy, setBusy] = useState<'location' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ridePickerOpen, setRidePickerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
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
  // Challenges for every active ride — not only the current selection — so a
  // challenge share stays available after today's cadence permanent post.
  const activeRideIds = useMemo(() => activeRides.map((ride) => ride.id), [activeRides]);
  const activeChallenges = useActiveRideChallenges(activeRideIds);
  const challengeShareRides = useMemo(
    () => activeRides.filter((ride) => activeChallenges.byRideId.has(ride.id)),
    [activeChallenges.byRideId, activeRides],
  );
  const preferredChallengeOnly = useMemo(() => {
    if (!preferredRideId) return false;
    const preferred = activeRides.find((ride) => ride.id === preferredRideId);
    if (!preferred) return false;
    return activeChallenges.byRideId.has(preferred.id) && !preferred.canPublishPermanent;
  }, [activeChallenges.byRideId, activeRides, preferredRideId]);

  const hasPermanentOption = permanentEligible.length > 0 || challengeShareRides.length > 0;
  // Challenge posts are always permanent (kept in the ride).
  const isTemporary = submitAsChallenge
    ? false
    : !hasPermanentOption || wantTemporary;
  /** Videos / challenge shares are single-Ride so caps and completions stay clear. */
  const singleRideOnly = isTemporary || hasVideo || submitAsChallenge;

  const permanentSelectable = useMemo(() => {
    // Keep challenge-only rides pickable when submitting a challenge, or when the
    // Home-selected ride already posted today but still has an open challenge.
    if (!submitAsChallenge && !preferredChallengeOnly) return permanentEligible;
    const byId = new Map<string, (typeof activeRides)[number]>();
    for (const ride of permanentEligible) byId.set(ride.id, ride);
    for (const ride of challengeShareRides) byId.set(ride.id, ride);
    return [...byId.values()];
  }, [
    challengeShareRides,
    permanentEligible,
    preferredChallengeOnly,
    submitAsChallenge,
  ]);

  const selectableRides = isTemporary ? temporaryEligible : permanentSelectable;
  const selectedRides = useMemo(
    () => selectableRides.filter((ride) => selectedRideIds.includes(ride.id)),
    [selectableRides, selectedRideIds],
  );
  const primaryRide = selectedRides[0] ?? null;
  const challengeEligibleRides = useMemo(
    () => selectedRides.filter((ride) => activeChallenges.byRideId.has(ride.id)),
    [activeChallenges.byRideId, selectedRides],
  );
  // Toggle follows the currently selected Ride(s) only.
  const showChallengeToggle = challengeEligibleRides.length > 0;
  const challengeTitle =
    challengeEligibleRides.length === 1
      ? activeChallenges.byRideId.get(challengeEligibleRides[0]!.id)?.challenge?.title
      : null;

  useEffect(() => {
    if (!showChallengeToggle) setSubmitAsChallenge(false);
  }, [showChallengeToggle]);

  // One-shot: land on challenge share when opening publish from a ride that
  // already posted today but still has an incomplete challenge.
  const didAutoChallengeRef = useRef(false);
  useEffect(() => {
    if (didAutoChallengeRef.current) return;
    if (!preferredChallengeOnly) return;
    didAutoChallengeRef.current = true;
    setWantTemporary(false);
    setSubmitAsChallenge(true);
  }, [preferredChallengeOnly]);

  const canShareTemporary = Boolean(
    isTemporary && selectedRides.length === 1 && selectedRides[0]!.temporaryRemaining > 0,
  );
  const canPublish = isTemporary
    ? canShareTemporary
    : hasVideo || submitAsChallenge
      ? selectedRides.length === 1 &&
        selectedRides.every(
          (ride) =>
            ride.canPublishPermanent || activeChallenges.byRideId.has(ride.id),
        )
      : selectedRides.length > 0 &&
        selectedRides.every((ride) => ride.canPublishPermanent);

  const defaultPermanentRideIds = useCallback(() => {
    // Only preselect the Ride the user is currently viewing on Home (or the
    // explicit camera deep-link). Other due Rides stay available in the picker.
    if (preferredRideId && permanentSelectable.some((ride) => ride.id === preferredRideId)) {
      return [preferredRideId];
    }
    if (permanentSelectable.length === 1) return [permanentSelectable[0]!.id];
    return [];
  }, [permanentSelectable, preferredRideId]);

  const defaultTemporaryRideId = useCallback(() => {
    if (preferredRideId && temporaryEligible.some((ride) => ride.id === preferredRideId)) {
      return preferredRideId;
    }
    if (temporaryEligible.length === 1) return temporaryEligible[0]!.id;
    return null;
  }, [preferredRideId, temporaryEligible]);

  useEffect(() => {
    if (!imageUri) {
      router.back();
    }
  }, [imageUri]);

  useEffect(() => {
    if (!activeRides.length) {
      setSelectedRideIds([]);
      setWantTemporary(false);
      initializedRideSelection.current = false;
      return;
    }

    if (!hasPermanentOption && !submitAsChallenge) {
      setWantTemporary((current) => (current ? current : true));
    }

    setSelectedRideIds((current) => {
      const same = (next: string[]) =>
        next.length === current.length && next.every((id, index) => id === current[index]);

      if (isTemporary) {
        const stillValid = current.filter((id) =>
          temporaryEligible.some((ride) => ride.id === id),
        );
        if (stillValid.length) {
          const next = [stillValid[0]!];
          return same(next) ? current : next;
        }
        if (initializedRideSelection.current) {
          return current.length === 0 ? current : [];
        }
        initializedRideSelection.current = true;
        const fallback = defaultTemporaryRideId();
        const next = fallback ? [fallback] : [];
        return same(next) ? current : next;
      }

      const stillValid = current.filter((id) =>
        permanentSelectable.some((ride) => ride.id === id),
      );
      if (hasVideo || submitAsChallenge) {
        if (stillValid.length) {
          const next = [stillValid[0]!];
          return same(next) ? current : next;
        }
        const defaults = defaultPermanentRideIds();
        const next = defaults.length ? [defaults[0]!] : [];
        if (!initializedRideSelection.current) initializedRideSelection.current = true;
        return same(next) ? current : next;
      }
      if (initializedRideSelection.current) {
        return same(stillValid) ? current : stillValid;
      }
      initializedRideSelection.current = true;
      const defaults = defaultPermanentRideIds();
      return same(defaults) ? current : defaults;
    });
  }, [
    activeRides.length,
    defaultPermanentRideIds,
    defaultTemporaryRideId,
    hasPermanentOption,
    hasVideo,
    isTemporary,
    permanentSelectable,
    submitAsChallenge,
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

  const temporaryForced = submitAsChallenge ? false : !hasPermanentOption;
  const composeTitle = submitAsChallenge
    ? 'Challenge'
    : temporaryForced
      ? '24-hour share'
      : isTemporary
        ? hasVideo
          ? '24h video'
          : '24h photo'
        : hasVideo
          ? 'New video'
          : 'New photo';

  useEffect(() => {
    navigation.setOptions({ title: composeTitle });
  }, [composeTitle, navigation]);

  const updateLocationQuery = (text: string) => {
    setLocationQuery(text);
    setSelectedLocation(null);
  };

  const pickLocationSuggestion = (suggestion: LocationSuggestion) => {
    skipLocationSearch.current = true;
    setSelectedLocation(suggestion);
    setLocationQuery(suggestion.locationName);
    setLocationSuggestions([]);
    setLocationPickerOpen(false);
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
      setLocationPickerOpen(false);
    } else if (nextLocation.status === 'denied') {
      setError('Location access was denied. Search or type a place instead.');
    } else {
      setError('Location is unavailable. Search or type a place instead.');
    }
    setBusy(null);
  };

  const clearLocation = () => {
    setSelectedLocation(null);
    setLocationQuery('');
    setLocationSuggestions([]);
  };

  const discardLocalDrafts = useCallback(() => {
    deleteLocalMediaFiles(imageUri, videoUri, audioUri);
  }, [audioUri, imageUri, videoUri]);

  // System back / retake / post-success all leave this screen — drop cache files.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      discardLocalDrafts();
    });
    return unsubscribe;
  }, [discardLocalDrafts, navigation]);

  const retake = () => {
    // Clear the in-tab draft first, then native-pop — same animation as the
    // system back button, but landing on the camera instead of the editor.
    // Local media is deleted via beforeRemove above.
    requestCaptureRetake();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/camera', params: { retake: '1' } });
  };

  const publish = async () => {
    if (!imageUri || !primaryRide || !canPublish || !selectedRides.length) return;
    if (hasVideo && !videoQuota.canPost) {
      toast.info(
        `You can only share ${POST_VIDEO_MAX_PER_DAY} videos per day. Try again tomorrow.`,
      );
      return;
    }
    setError(null);
    try {
      const typedName = locationQuery.trim() || null;
      const challengeByRideId: Record<string, string> = {};
      if (submitAsChallenge) {
        for (const ride of challengeEligibleRides) {
          const challenge = activeChallenges.byRideId.get(ride.id);
          if (challenge) challengeByRideId[ride.id] = challenge.id;
        }
      }
      // Challenge completions are always permanent (kept in the ride).
      const publishAsTemporary = submitAsChallenge ? false : isTemporary;
      await createPost.mutateAsync({
        rideIds: selectedRides.map((ride) => ride.id),
        imageUri,
        audioUri: hasVideo ? null : audioUri,
        videoUri: videoUri ?? null,
        videoDurationMs,
        description,
        scheduledDate: primaryRide.postDate,
        isTemporary: publishAsTemporary,
        latitude: selectedLocation?.latitude ?? null,
        longitude: selectedLocation?.longitude ?? null,
        locationName: selectedLocation?.locationName ?? typedName,
        challengeByRideId,
      });
      if (!publishAsTemporary) {
        await Promise.all(
          selectedRides
            .filter((ride) => ride.scheduledToday)
            .map((ride) =>
              notifications.onPostCreated(ride.id, ride.scheduledToday!).catch(() => []),
            ),
        );
      }
      haptics.success();
      // Clear the Camera-tab draft without visiting Camera (avoids a flash),
      // then land on Rides for the published ride. beforeRemove cleans local files.
      requestCaptureRetake();
      router.dismissTo({
        pathname: '/',
        params: {
          selectRideId: primaryRide.id,
          notificationOpenId: String(Date.now()),
        },
      });
    } catch (cause) {
      haptics.error();
      setError(
        cause instanceof Error
          ? cause.message
          : `The ${hasVideo ? 'video' : 'photo'} could not be published.`,
      );
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
    setRidePickerOpen(false);
  };

  const handleRideSelect = (rideId: string) => {
    if (singleRideOnly) {
      selectTemporaryRide(rideId);
      return;
    }
    togglePermanentRide(rideId);
  };

  const choosePermanent = () => {
    setWantTemporary(false);
    setSelectedRideIds((current) => {
      const stillValid = current.filter((id) =>
        permanentSelectable.some((ride) => ride.id === id),
      );
      if (hasVideo || submitAsChallenge) {
        if (stillValid.length) return [stillValid[0]!];
        const defaults = defaultPermanentRideIds();
        return defaults.length ? [defaults[0]!] : [];
      }
      return stillValid.length ? stillValid : defaultPermanentRideIds();
    });
  };

  const chooseTemporary = () => {
    setWantTemporary(true);
    setSelectedRideIds((current) => {
      const stillValid = current.find((id) =>
        temporaryEligible.some((ride) => ride.id === id),
      );
      if (stillValid) return [stillValid];
      const fallback = defaultTemporaryRideId();
      return fallback ? [fallback] : [];
    });
  };

  if (!imageUri) {
    return <View style={styles.safeArea} />;
  }

  const locationHint = selectedLocation
    ? null
    : locationQuery.trim().length >= 2 && !locationSuggestions.length && busy !== 'search'
      ? 'No matches — will post as a typed label.'
      : locationQuery.trim() && !selectedLocation
        ? 'Pick a suggestion above or keep typing.'
        : null;

  const footerPad = Math.max(insets.bottom, spacing.sm);
  const temporaryHint = temporaryForced
    ? null
    : isTemporary
      ? 'Lasts 24 hours and doesn’t count as today’s publication.'
      : selectedRides.length > 1
        ? 'Same photo on each selected Ride. Counts as today’s publication for each.'
        : 'Stays in the feed and counts as today’s publication.';
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
  const rideTriggerLabel = singleRideOnly
    ? (primaryRide?.name ?? 'Choose a Ride')
    : selectedRides.length === 0
      ? 'Choose Rides'
      : selectedRides.length === 1
        ? selectedRides[0]!.name
        : `${selectedRides.length} Rides selected`;
  const locationTriggerLabel =
    selectedLocation?.locationName ?? (locationQuery.trim() || 'Add location');
  const headerOffset = headerHeight + spacing.xxs;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <View style={styles.flex}>
        <KeyboardAwareScrollView
          bottomOffset={PUBLISH_BAR_HEIGHT + KEYBOARD_SCROLL_EXTRA + footerPad}
          contentContainerStyle={[
            styles.composeContent,
            {
              paddingBottom:
                spacing.xl + PUBLISH_BAR_HEIGHT + footerPad + KEYBOARD_SCROLL_EXTRA,
            },
          ]}
          extraKeyboardSpace={KEYBOARD_SCROLL_EXTRA}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          style={[styles.flex, { marginTop: headerOffset }]}
        >
          <View style={styles.previewBlock}>
            {isTemporary ? (
              <Text style={styles.tempPreviewHint}>
                This {hasVideo ? 'video' : 'photo'} will disappear from after 24 hours.
              </Text>
            ) : submitAsChallenge ? (
              <Text style={styles.tempPreviewHint}>
                Challenge photos stay in the Ride feed.
              </Text>
            ) : null}

            <View style={styles.previewFrame}>
              {hasVideo && videoUri ? (
                <PublishVideoPreview
                  durationMs={videoDurationMs}
                  thumbnailUri={imageUri}
                  videoUri={videoUri}
                />
              ) : (
                <Image resizeMode="contain" source={{ uri: imageUri }} style={styles.preview} />
              )}
              <Pressable
                accessibilityLabel="Retake or choose another photo"
                accessibilityRole="button"
                onPress={retake}
                style={({ pressed }) => [styles.previewRetake, pressed && styles.pressed]}
              >
                <Ionicons color={colors.white} name="refresh" size={16} />
                <Text style={styles.previewRetakeText}>Retake</Text>
              </Pressable>
            </View>

            <GlassSurface style={styles.captionBlock}>
              <TextInput
                autoCapitalize="sentences"
                maxLength={50}
                multiline
                onChangeText={setDescription}
                placeholder="Add a caption…"
                placeholderTextColor={colors.muted}
                selectionColor={colors.accent}
                style={styles.captionInput}
                value={description}
              />
              <Text style={styles.captionCounter}>{description.length}/50</Text>
            </GlassSurface>
          </View>

          <View style={styles.composeForm}>
            {hasPermanentOption && !submitAsChallenge ? (
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
                  {singleRideOnly ? 'Post to' : 'Post to Rides'}
                </Text>
                {tempAvailability ? (
                  <Text style={styles.captionMeta}>{tempAvailability}</Text>
                ) : hasVideo ? (
                  <Text style={styles.captionMeta}>
                    {videoQuota.remaining}/{POST_VIDEO_MAX_PER_DAY} videos left today
                  </Text>
                ) : !isTemporary && permanentSelectable.length > 1 ? (
                  <Text style={styles.captionMeta}>select one or more</Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setRidePickerOpen(true)}
                style={({ pressed }) => [styles.pickerTrigger, pressed && styles.pressed]}
              >
                <View style={styles.pickerTriggerText}>
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
                <Ionicons color={colors.muted} name="chevron-forward" size={18} />
              </Pressable>
              {temporaryHint ? <Text style={styles.hint}>{temporaryHint}</Text> : null}
            </View>

            {showChallengeToggle ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: submitAsChallenge }}
                onPress={() => {
                  haptics.light();
                  setSubmitAsChallenge((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.challengeToggle,
                  submitAsChallenge && styles.challengeToggleOn,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.challengeToggleCopy}>
                  <Text style={styles.challengeToggleTitle}>Submit as challenge</Text>
                  <Text style={styles.challengeToggleMeta}>
                    {challengeTitle
                      ? challengeTitle
                      : `${challengeEligibleRides.length} selected Rides have an active challenge`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.challengeSwitch,
                    submitAsChallenge && styles.challengeSwitchOn,
                  ]}
                >
                  <View
                    style={[
                      styles.challengeSwitchKnob,
                      submitAsChallenge && styles.challengeSwitchKnobOn,
                    ]}
                  />
                </View>
              </Pressable>
            ) : null}

            <View style={styles.locationBlock}>
              <View style={styles.postToLabelRow}>
                <Text style={styles.sectionLabel}>Location</Text>
                <Text style={styles.captionMeta}>optional</Text>
              </View>

              <View style={styles.pickerTrigger}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLocationPickerOpen(true)}
                  style={({ pressed }) => [
                    styles.pickerTriggerMain,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    color={
                      selectedLocation || locationQuery.trim()
                        ? colors.primary
                        : colors.muted
                    }
                    name="location-outline"
                    size={18}
                  />
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[
                      styles.rideName,
                      !(selectedLocation || locationQuery.trim()) && styles.pickerPlaceholder,
                    ]}
                  >
                    {locationTriggerLabel}
                  </Text>
                </Pressable>
                {selectedLocation || locationQuery.trim() ? (
                  <Pressable
                    accessibilityLabel="Clear location"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={clearLocation}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Ionicons color={colors.muted} name="close-circle" size={18} />
                  </Pressable>
                ) : (
                  <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                )}
              </View>
            </View>

            {audioUri && !hasVideo ? (
              <AudioNotePreview
                durationMs={audioDurationMs}
                onClear={() => {
                  deleteLocalMediaFile(audioUri);
                  setAudioUri(null);
                  setAudioDurationMs(null);
                }}
                uri={audioUri}
              />
            ) : null}

            <ErrorBanner message={error} />
          </View>
        </KeyboardAwareScrollView>

        <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.composeFooterSticky}>
          <View style={[styles.composeFooter, { paddingBottom: footerPad }]}>
            <PublishAudioFooter
              audioUri={hasVideo ? null : audioUri}
              hideMic={hasVideo}
              onAudioChange={(uri, durationMs) => {
                if (!uri && audioUri) deleteLocalMediaFile(audioUri);
                setAudioUri(uri);
                setAudioDurationMs(durationMs);
              }}
              onPublish={() => void publish()}
              publishDisabled={!selectedRides.length || !canPublish || busy === 'location'}
              publishLabel={publishLabel}
              publishLoading={createPost.isPending}
            />
          </View>
        </KeyboardStickyView>

        <RidePickerModal
          isTemporary={singleRideOnly}
          onClose={() => setRidePickerOpen(false)}
          onSelect={handleRideSelect}
          rides={isTemporary ? temporaryEligible : permanentSelectable}
          selectedIds={selectedRideIds}
          visible={ridePickerOpen}
        />

        <LocationPickerModal
          hint={locationHint}
          locating={busy === 'location'}
          locationQuery={locationQuery}
          onChangeQuery={updateLocationQuery}
          onClear={clearLocation}
          onClose={() => setLocationPickerOpen(false)}
          onLocate={() => void applyCurrentLocation()}
          onPickSuggestion={pickLocationSuggestion}
          searching={busy === 'search'}
          selectedLocation={selectedLocation}
          suggestions={locationSuggestions}
          visible={locationPickerOpen}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  composeContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  previewBlock: {
    alignSelf: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  previewFrame: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    width: '52%',
    ...shadows.card,
  },
  preview: {
    aspectRatio: POST_IMAGE_ASPECT_RATIO,
    width: '100%',
  },
  tempPreviewHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
  sectionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  postToBlock: { gap: spacing.xs },
  pickerTrigger: {
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
  pickerTriggerMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  pickerTriggerText: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pickerPlaceholder: { color: colors.muted, fontWeight: '600' },
  rideName: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
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
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
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
  captionBlock: {
    borderRadius: radius.md,
    gap: spacing.xxs,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  captionInput: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    minHeight: 44,
    padding: 0,
    textAlignVertical: 'top',
  },
  captionCounter: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  locationBlock: { gap: spacing.xs },
  hint: { color: colors.muted, fontSize: 13, fontWeight: '500', marginTop: 2 },
  challengeToggle: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  challengeToggleOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.highlight,
  },
  challengeToggleCopy: { flex: 1, gap: 2, minWidth: 0 },
  challengeToggleTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  challengeToggleMeta: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  challengeSwitch: {
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 2,
    width: 48,
  },
  challengeSwitchOn: { backgroundColor: colors.primary },
  challengeSwitchKnob: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 24,
    width: 24,
  },
  challengeSwitchKnobOn: { alignSelf: 'flex-end' },
  composeFooterSticky: {
    backgroundColor: colors.background,
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
