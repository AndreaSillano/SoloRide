import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppMark,
  Body,
  Button,
  Card,
  Eyebrow,
  ErrorBanner,
  Heading,
  Screen,
} from '@/components/ui';
import { envConfigurationError } from '@/lib/env';
import { spacing } from '@/theme';

export default function AuthLandingScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <AppMark />
        <Eyebrow>Share your ride, with your friends.</Eyebrow>
        <Heading>Remember the thoughts, together.</Heading>
        <Body muted>
          A quiet place for your closest people to share one real thought at a
          time.
        </Body>
      </View>
      <Card>
        <ErrorBanner message={envConfigurationError} />
        <Button variant="accent" onPress={() => router.push('/register')}>
          Start a Ride
        </Button>
        <Button variant="secondary" onPress={() => router.push('/login')}>
          I already have an account
        </Button>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
});
