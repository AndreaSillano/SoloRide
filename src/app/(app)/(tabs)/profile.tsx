import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth, useCurrentUser } from '@/auth/auth-context';
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
import { groupUserRides, useUserRides } from '@/features/rides';
import { colors, radius, spacing } from '@/theme';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { user, profile, profileError, refreshProfile } = useCurrentUser();
  const rides = useUserRides(user?.id);
  const notifications = useSoloRideNotifications(user?.id ?? null);
  const [permission, setPermission] = useState<SoloRidePermissionStatus>('undetermined');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'logout' | 'toggle' | null>(null);

  const groups = useMemo(() => groupUserRides(rides.data ?? []), [rides.data]);
  const username = profile?.username ?? null;

  useEffect(() => {
    void notifications.getPermission().then(setPermission);
  }, [notifications]);

  useEffect(() => {
    if (!user?.id) {
      setPrefsReady(false);
      return;
    }
    let cancelled = false;
    setPrefsReady(false);
    void getNotificationsEnabled(user.id).then((enabled) => {
      if (cancelled) return;
      setAlertsEnabled(enabled);
      setPrefsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggleAlerts = async (next: boolean) => {
    if (!user?.id || busy === 'toggle') return;
    setBusy('toggle');
    setError(null);
    const previous = alertsEnabled;
    setAlertsEnabled(next);
    try {
      if (next) {
        const nextPermission = await requestSoloRideNotificationPermission();
        setPermission(nextPermission);
        if (nextPermission !== 'granted') {
          setAlertsEnabled(false);
          await setNotificationsEnabled(user.id, false);
          setError(
            nextPermission === 'denied'
              ? 'Notifications are blocked for SoloRide. Enable them in system Settings.'
              : 'Notifications are unavailable on this device.',
          );
          return;
        }
      }
      await setNotificationsEnabled(user.id, next);
      requestNotificationRefresh();
    } catch {
      setAlertsEnabled(previous);
      setError('Notification preference could not be updated.');
    } finally {
      setBusy(null);
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

  return (
    <ScrollScreen>
      <View style={styles.identity}>
        <Avatar profile={{ username }} size={88} />
        <Text style={styles.username}>{username ? `@${username}` : 'Your profile'}</Text>
        <Text style={styles.tagline}>Private photo rides with your people</Text>
      </View>

      <ErrorBanner message={profileError} />
      {profileError ? (
        <Button variant="secondary" onPress={() => void refreshProfile()}>
          Retry profile
        </Button>
      ) : null}

      {!rides.isPending && rides.data ? (
        <Text style={styles.rideSummary}>
          {groups.active.length} active
          {groups.upcoming.length ? ` · ${groups.upcoming.length} upcoming` : ''}
          {groups.archived.length ? ` · ${groups.archived.length} archived` : ''}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notifications</Text>
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
              <Button variant="secondary" onPress={() => void Linking.openSettings()}>
                Open system Settings
              </Button>
            ) : null}
          </View>
          {prefsReady ? (
            <Switch
              disabled={busy === 'toggle'}
              onValueChange={(value) => void toggleAlerts(value)}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
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
          Forgot your password? SoloRide usernames use private internal accounts, so recovery
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
  rideSummary: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
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
    width: 36,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  toggleSpinner: { marginRight: spacing.xs },
  helpCopy: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    paddingHorizontal: spacing.xxs,
  },
});
