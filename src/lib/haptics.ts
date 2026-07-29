import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

export const haptics = {
  light: () => {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: () => {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  selection: () => {
    if (!enabled) return;
    void Haptics.selectionAsync();
  },
  success: () => {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  warning: () => {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
  error: () => {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};
