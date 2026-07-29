import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';
import { Badge, Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

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
      badgeBackgroundColor={colors.accent}
      iconColor={{ default: colors.muted, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.muted, fontSize: 11, fontWeight: '700' },
        selected: { color: colors.primary, fontSize: 11, fontWeight: '700' },
      }}
      tintColor={colors.primary}
    >
      <NativeTabs.Trigger name="index">
        <Label>Rides</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="images-outline" />,
            selected: <VectorIcon family={Ionicons} name="images" />,
          }}
          sf={{ default: 'photo.stack', selected: 'photo.stack.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="camera">
        <Label>Camera</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="camera-outline" />,
            selected: <VectorIcon family={Ionicons} name="camera" />,
          }}
          sf={{ default: 'camera', selected: 'camera.fill' }}
        />
        <Badge hidden={!needsRequiredPhoto}>{needsRequiredPhoto ? '!' : undefined}</Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Label>Profile</Label>
        <Icon
          androidSrc={{
            default: <VectorIcon family={Ionicons} name="person-outline" />,
            selected: <VectorIcon family={Ionicons} name="person" />,
          }}
          sf={{ default: 'person', selected: 'person.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
