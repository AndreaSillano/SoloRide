import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useCurrentUser } from '@/auth/auth-context';
import { useRidesDueToday } from '@/features/rides';
import { colors } from '@/theme';

export default function TabLayout() {
  const { user } = useCurrentUser();
  const due = useRidesDueToday(user?.id);
  const needsRequiredPhoto = Boolean(due.data?.needsRequiredPhoto);

  return (
    <NativeTabs
      // Leave the iOS tab bar background untouched so it keeps the system's
      // native translucent/Liquid Glass material. Android has no equivalent
      // glass material, so give it a solid, on-brand background instead.
      backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
      badgeBackgroundColor={colors.primary}
      iconColor={{ default: colors.muted, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.muted, fontSize: 11, fontWeight: '700' },
        selected: { color: colors.primary, fontSize: 11, fontWeight: '700' },
      }}
      tintColor={colors.primary}
    >
      <NativeTabs.Trigger
        disableAutomaticContentInsets
        name="index"
      >
        <NativeTabs.Trigger.Label>Rides</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="photo_library"
          sf={{ default: 'photo.stack', selected: 'photo.stack.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger disableAutomaticContentInsets name="camera">
        <NativeTabs.Trigger.Label>Camera</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="photo_camera"
          sf={{ default: 'camera', selected: 'camera.fill' }}
        />
        <NativeTabs.Trigger.Badge hidden={!needsRequiredPhoto}>
          {needsRequiredPhoto ? '!' : undefined}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="person"
          sf={{ default: 'person', selected: 'person.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
