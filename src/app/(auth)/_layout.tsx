import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: 'Back',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: colors.primary,
        headerTitle: '',
        headerTransparent: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="privacy-policy"
        options={{
          headerTitle: 'Privacy',
          headerTitleStyle: { color: colors.text, fontWeight: '800' },
        }}
      />
    </Stack>
  );
}
