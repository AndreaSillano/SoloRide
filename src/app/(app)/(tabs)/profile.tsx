import Ionicons from '@expo/vector-icons/Ionicons';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth, useCurrentUser } from '@/auth/auth-context';
import { NativeSwitch } from '@/components/glass';
import {
  Avatar,
  Button,
  ErrorBanner,
  ScrollScreen,
} from '@/components/ui';
import {
  getNotificationsEnabled,
  requestNotificationRefresh,
  requestSoloRideNotificationPermission,
  setNotificationsEnabled,
  useSoloRideNotifications,
  type SoloRidePermissionStatus,
} from '@/features/notifications';
import {
  getForegroundLocationPermission,
  requestForegroundLocationPermission,
  type AppPermissionStatus,
} from '@/features/permissions';
import { ProfileDataError, useRemoveAvatar, useUpdateAvatar } from '@/features/profile';
import { groupUserRides, useMyPendingJoinRequests, useUserRides } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

function OpenSettingsLink({ onOpen }: { onOpen?: () => void }) {
  return (
    <Pressable
      accessibilityHint="Opens Rhodeo settings on this device"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        onOpen?.();
        void Linking.openSettings();
      }}
      style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
    >
      <Ionicons color={colors.primary} name="settings-outline" size={14} />
      <Text style={styles.settingsLinkText}>Open Settings</Text>
      <Ionicons color={colors.primary} name="open-outline" size={12} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { user, profile, profileError, refreshProfile } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const pendingJoins = useMyPendingJoinRequests(user?.id);
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const updateAvatar = useUpdateAvatar();
  const removeAvatar = useRemoveAvatar();
  const [cameraPermission, requestCameraPermission, getCameraPermission] =
    useCameraPermissions();
  const [permission, setPermission] = useState<SoloRidePermissionStatus>('undetermined');
  const [locationStatus, setLocationStatus] = useState<AppPermissionStatus>('undetermined');
  const [locationCanAskAgain, setLocationCanAskAgain] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    'logout' | 'toggle' | 'camera' | 'location' | 'avatar' | null
  >(null);
  const awaitingNotificationSettings = useRef(false);
  const previousPermission = useRef<SoloRidePermissionStatus | null>(null);

  const groups = useMemo(() => groupUserRides(rides.data ?? []), [rides.data]);
  const pendingJoinCount = pendingJoins.data?.length ?? 0;
  const username = profile?.username ?? null;
  const avatarBusy = busy === 'avatar' || updateAvatar.isPending || removeAvatar.isPending;
  const cameraGranted = Boolean(cameraPermission?.granted);
  const cameraBlocked = cameraPermission?.granted === false && cameraPermission.canAskAgain === false;
  const locationGranted = locationStatus === 'granted';
  const locationBlocked = locationStatus === 'denied' && !locationCanAskAgain;

  const refreshLocationPermission = async () => {
    const next = await getForegroundLocationPermission();
    setLocationStatus(next.status);
    setLocationCanAskAgain(next.canAskAgain);
  };

  useEffect(() => {
    void refreshLocationPermission();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !user?.id) return;
      void getCameraPermission();
      void refreshLocationPermission();
      void notifications.getPermission().then(async (next) => {
        const previous = previousPermission.current;
        previousPermission.current = next;
        setPermission(next);

        // Fresh OS grant (including return from Settings) → turn Ride alerts on.
        // Skip the first null→status read so an intentional in-app off stays off.
        if (
          next === 'granted' &&
          (awaitingNotificationSettings.current ||
            (previous !== null && previous !== 'granted'))
        ) {
          awaitingNotificationSettings.current = false;
          setAlertsEnabled(true);
          await setNotificationsEnabled(user.id, true);
          requestNotificationRefresh();
          return;
        }

        // Only clear the in-app preference when OS permission is explicitly
        // denied — not while it is still undetermined (e.g. mid sign-in prompts).
        if (next === 'denied') {
          const enabled = await getNotificationsEnabled(user.id);
          if (!enabled) return;
          setAlertsEnabled(false);
          await setNotificationsEnabled(user.id, false);
          requestNotificationRefresh();
        }
      });
    });
    return () => sub.remove();
  }, [getCameraPermission, notifications, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setPrefsReady(false);
      previousPermission.current = null;
      return;
    }
    let cancelled = false;
    setPrefsReady(false);
    void (async () => {
      const [enabled, nextPermission] = await Promise.all([
        getNotificationsEnabled(user.id),
        notifications.getPermission(),
      ]);
      if (cancelled) return;
      previousPermission.current = nextPermission;
      setPermission(nextPermission);
      setAlertsEnabled(enabled);
      setPrefsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [notifications, user?.id]);

  const pickAvatar = async () => {
    setError(null);
    setBusy('avatar');
    try {
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        setError('Photo library access was denied.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await updateAvatar.mutateAsync(result.assets[0].uri);
    } catch (cause) {
      setError(
        cause instanceof ProfileDataError || cause instanceof Error
          ? cause.message
          : 'The profile photo could not be updated.',
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmRemoveAvatar = () => {
    Alert.alert('Remove photo?', 'Your profile will show initials instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setError(null);
            setBusy('avatar');
            try {
              await removeAvatar.mutateAsync();
            } catch (cause) {
              setError(
                cause instanceof ProfileDataError || cause instanceof Error
                  ? cause.message
                  : 'The profile photo could not be removed.',
              );
            } finally {
              setBusy(null);
            }
          })();
        },
      },
    ]);
  };

  const openAvatarActions = () => {
    if (avatarBusy) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      {
        text: profile?.avatar_url ? 'Change photo' : 'Add photo',
        onPress: () => void pickAvatar(),
      },
    ];
    if (profile?.avatar_url) {
      buttons.push({
        text: 'Remove photo',
        style: 'destructive',
        onPress: confirmRemoveAvatar,
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile photo', undefined, buttons);
  };

  const toggleCamera = async (next: boolean) => {
    if (busy === 'camera') return;
    setBusy('camera');
    setError(null);
    try {
      if (next) {
        if (cameraBlocked) {
          await Linking.openSettings();
          return;
        }
        const result = await requestCameraPermission();
        if (!result.granted) {
          setError(
            result.canAskAgain === false
              ? 'Camera access is blocked for Rhodeo. Enable it in system Settings.'
              : 'Camera access was not granted.',
          );
        }
        return;
      }
      Alert.alert(
        'Turn off camera?',
        'Rhodeo can’t revoke camera access itself. You can disable it in system Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
    } catch {
      setError('Camera permission could not be updated.');
    } finally {
      setBusy(null);
      void getCameraPermission();
    }
  };

  const toggleLocation = async (next: boolean) => {
    if (busy === 'location') return;
    setBusy('location');
    setError(null);
    try {
      if (next) {
        if (locationBlocked) {
          await Linking.openSettings();
          return;
        }
        const result = await requestForegroundLocationPermission();
        setLocationStatus(result.status);
        setLocationCanAskAgain(result.canAskAgain);
        if (result.status !== 'granted') {
          setError(
            result.canAskAgain === false
              ? 'Location access is blocked for Rhodeo. Enable it in system Settings.'
              : 'Location access was not granted.',
          );
        }
        return;
      }
      Alert.alert(
        'Turn off location?',
        'Rhodeo can’t revoke location access itself. You can disable it in system Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
    } catch {
      setError('Location permission could not be updated.');
    } finally {
      setBusy(null);
      void refreshLocationPermission();
    }
  };

  const toggleAlerts = async (next: boolean) => {
    if (!user?.id || busy === 'toggle') return;
    setBusy('toggle');
    setError(null);
    const previous = alertsEnabled;
    try {
      if (next) {
        // iOS will not show the permission dialog again after a deny / Settings
        // revoke — the user must re-enable Notifications there.
        if (permission === 'denied') {
          awaitingNotificationSettings.current = true;
          Alert.alert(
            'Enable notifications in Settings',
            'iOS won’t ask again from Rhodeo. Turn on Allow Notifications (and Badges) for Rhodeo, then return here.',
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  awaitingNotificationSettings.current = false;
                },
              },
              { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ],
          );
          return;
        }

        const nextPermission = await requestSoloRideNotificationPermission();
        setPermission(nextPermission);
        if (nextPermission !== 'granted') {
          setAlertsEnabled(false);
          await setNotificationsEnabled(user.id, false);
          requestNotificationRefresh();
          if (nextPermission === 'denied') {
            awaitingNotificationSettings.current = true;
            Alert.alert(
              'Enable notifications in Settings',
              'iOS won’t ask again from Rhodeo. Turn on Allow Notifications (and Badges) for Rhodeo, then return here.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => {
                    awaitingNotificationSettings.current = false;
                  },
                },
                { text: 'Open Settings', onPress: () => void Linking.openSettings() },
              ],
            );
            return;
          }
          setError('Notifications are unavailable on this device.');
          return;
        }
        setAlertsEnabled(true);
        await setNotificationsEnabled(user.id, true);
        requestNotificationRefresh();
        return;
      }

      setAlertsEnabled(false);
      await setNotificationsEnabled(user.id, false);
      requestNotificationRefresh();
      Alert.alert(
        'Ride alerts turned off',
        'Reminders and push are stopped for this account. To also revoke system permission, disable Notifications in Settings.',
        [
          { text: 'Done', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
    } catch {
      setAlertsEnabled(previous);
      setError('Notification preference could not be updated.');
    } finally {
      setBusy(null);
      void notifications.getPermission().then(setPermission);
    }
  };

  const handleLogout = async () => {
    setBusy('logout');
    setError(null);
    try {
      await logout();
    } catch {
      setError('We could not log you out. Please try again.');
      setBusy(null);
    }
  };

  const openRidesList = () => {
    router.push('/your-rides');
  };

  const rideSummary = useMemo(() => {
    const parts = [
      groups.active.length ? `${groups.active.length} active` : null,
      groups.upcoming.length ? `${groups.upcoming.length} upcoming` : null,
      groups.archived.length ? `${groups.archived.length} archived` : null,
      pendingJoinCount ? `${pendingJoinCount} pending` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'No Rides yet';
  }, [groups, pendingJoinCount]);

  return (
    <ScrollScreen>
      <View style={styles.identity}>
        <Pressable
          accessibilityLabel="Change profile photo"
          accessibilityRole="button"
          disabled={avatarBusy}
          onPress={openAvatarActions}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          <Avatar
            profile={{ username: profile?.username, avatar_url: profile?.avatar_url }}
            size={88}
          />
          <View style={styles.avatarBadge}>
            {avatarBusy ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons color={colors.white} name="camera" size={14} />
            )}
          </View>
        </Pressable>
        <Text style={styles.username}>{username ? `@${username}` : 'Your profile'}</Text>
        <Text style={styles.tagline}>Private photo rides with your people</Text>
      </View>

      <ErrorBanner message={profileError} />
      {profileError ? (
        <Button variant="secondary" onPress={() => void refreshProfile()}>
          Retry profile
        </Button>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Your Rides</Text>
        <Pressable
          accessibilityHint="Opens a list of all your Rides"
          accessibilityLabel={
            pendingJoinCount > 0
              ? `Your Rides, ${pendingJoinCount} pending join request${
                  pendingJoinCount === 1 ? '' : 's'
                }`
              : 'Your Rides'
          }
          accessibilityRole="button"
          onPress={openRidesList}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowIcon}>
            <Ionicons color={colors.primary} name="images-outline" size={20} />
            {pendingJoinCount > 0 ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.rowDot}
              />
            ) : null}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>
              {rides.isPending
                ? 'Loading…'
                : `${rides.data?.length ?? 0} Ride${(rides.data?.length ?? 0) === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.rowSubtitle}>
              {rides.isPending ? 'Checking your Rides…' : rideSummary}
            </Text>
          </View>
          <Ionicons color={colors.muted} name="chevron-forward" size={18} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Permissions</Text>
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons color={colors.primary} name="camera-outline" size={20} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Camera</Text>
            <Text style={styles.rowSubtitle}>
              Take photos for your Rides from the Camera tab.
            </Text>
            {cameraBlocked ? <OpenSettingsLink /> : null}
          </View>
          {cameraPermission ? (
            <NativeSwitch
              disabled={busy === 'camera'}
              onValueChange={(value) => {
                haptics.selection();
                void toggleCamera(value);
              }}
              value={cameraGranted}
            />
          ) : (
            <ActivityIndicator color={colors.primary} style={styles.toggleSpinner} />
          )}
        </View>
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons color={colors.primary} name="location-outline" size={20} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Location</Text>
            <Text style={styles.rowSubtitle}>
              Optionally tag photos with where they were taken.
            </Text>
            {locationBlocked ? <OpenSettingsLink /> : null}
          </View>
          <NativeSwitch
            disabled={busy === 'location'}
            onValueChange={(value) => {
              haptics.selection();
              void toggleLocation(value);
            }}
            value={locationGranted}
          />
        </View>
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons color={colors.primary} name="notifications-outline" size={20} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Ride alerts</Text>
            <Text style={styles.rowSubtitle}>
              Schedule reminders, new photos in your Rides, and comments on your posts.
            </Text>
            {permission === 'denied' ? (
              <OpenSettingsLink
                onOpen={() => {
                  awaitingNotificationSettings.current = true;
                }}
              />
            ) : null}
          </View>
          {prefsReady ? (
            <NativeSwitch
              disabled={busy === 'toggle'}
              onValueChange={(value) => {
                haptics.selection();
                void toggleAlerts(value);
              }}
              value={alertsEnabled && permission !== 'denied'}
            />
          ) : (
            <ActivityIndicator color={colors.primary} style={styles.toggleSpinner} />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <Text style={styles.helpCopy}>
          Forgot your password? Rhodeo usernames use private internal accounts, so recovery
          must go through an administrator. Never share your current password.
        </Text>
      </View>

      <ErrorBanner message={error} />

      <Button loading={busy === 'logout'} variant="danger" onPress={() => void handleLogout()}>
        Log out
      </Button>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  avatarButton: {
    position: 'relative',
  },
  avatarBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: 0,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 30,
  },
  username: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  tagline: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: { gap: spacing.xs },
  sectionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingHorizontal: spacing.xxs,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xs,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
    width: 36,
  },
  rowDot: {
    backgroundColor: colors.highlight,
    borderRadius: radius.pill,
    elevation: 4,
    height: 8,
    position: 'absolute',
    right: -2,
    shadowColor: colors.highlight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    top: -2,
    width: 8,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  settingsLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  settingsLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSpinner: { marginRight: spacing.xs },
  helpCopy: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    paddingHorizontal: spacing.xxs,
  },
  pressed: { opacity: 0.8 },
});
