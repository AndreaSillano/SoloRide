import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function AppLayout() {
  return (
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="publish" options={{ title: 'New photo' }} />
      <Stack.Screen name="your-rides" options={{ title: 'Your Rides' }} />
      <Stack.Screen name="privacy-policy" options={{ title: 'Privacy' }} />
      <Stack.Screen
        name="create-ride"
        options={{ animationTypeForReplace: 'pop', title: 'Create Ride' }}
      />
      <Stack.Screen
        name="join-ride"
        options={{ animationTypeForReplace: 'pop', title: 'Join Ride' }}
      />
      <Stack.Screen name="ride/[rideId]/index" options={{ title: 'Ride' }} />
      <Stack.Screen name="ride/[rideId]/create-post" options={{ title: 'Add photo' }} />
      <Stack.Screen
        name="ride/[rideId]/settings"
        options={{ animationTypeForReplace: 'pop', title: 'Ride settings' }}
      />
      <Stack.Screen
        name="ride/[rideId]/challenge/[rideChallengeId]"
        options={{ title: 'Challenge' }}
      />
    </Stack>
  );
}
