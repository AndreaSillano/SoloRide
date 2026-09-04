import { Stack } from 'expo-router';

import { SuperUserGate } from '@/components/super-user-gate';
import { colors } from '@/theme';

export default function ShopLayout() {
  return (
    <SuperUserGate>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: 'transparent' },
          headerShadowVisible: false,
          headerTransparent: true,
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontWeight: '800' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Shop' }} />
        <Stack.Screen name="[productId]" options={{ title: '' }} />
        <Stack.Screen name="messages/index" options={{ title: 'Messages' }} />
        <Stack.Screen name="messages/[groupId]" options={{ title: '' }} />
      </Stack>
    </SuperUserGate>
  );
}
