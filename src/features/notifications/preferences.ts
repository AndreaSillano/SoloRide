import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'soloride:notifications-enabled:';

/** App-level opt-in on top of OS permission. Defaults to on so first-time
 * grants still schedule reminders and register for social push. */
export async function getNotificationsEnabled(userId: string): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + userId);
  if (stored === null) return true;
  return stored === '1';
}

export async function setNotificationsEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_PREFIX + userId, enabled ? '1' : '0');
}
