import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import {
  loginSchema,
  type LoginValues,
} from '@/auth/schemas';
import {
  AppMark,
  Body,
  Button,
  Card,
  Eyebrow,
  ErrorBanner,
  Field,
  Heading,
  Screen,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

const MAX_FAILED_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 30;

export default function LoginScreen() {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const onSubmit = handleSubmit(async ({ username, password }) => {
    if (secondsRemaining > 0) return;
    setSubmitError(null);

    try {
      await login(username, password);
    } catch {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setSubmitError('That username or password is not correct.');
      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        setFailedAttempts(0);
        setSecondsRemaining(COOLDOWN_SECONDS);
      }
    }
  });

  const coolingDown = secondsRemaining > 0;

  return (
    <Screen>
      <View style={styles.intro}>
        <AppMark compact />
        <Eyebrow>Welcome back</Eyebrow>
        <Heading>Pick up where you left off.</Heading>
        <Body muted>Log in with your SoloRide username.</Body>
      </View>
      <Card>
        <Controller
          control={control}
          name="username"
          render={({ field: { onBlur, onChange, value } }) => (
            <Field
              autoComplete="username"
              error={errors.username?.message}
              label="Username"
              onBlur={onBlur}
              onChangeText={onChange}
              returnKeyType="next"
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <Field
              autoComplete="current-password"
              error={errors.password?.message}
              label="Password"
              onBlur={onBlur}
              onChangeText={onChange}
              onSubmitEditing={onSubmit}
              secureTextEntry
              value={value}
            />
          )}
        />
        <ErrorBanner
          message={
            coolingDown
              ? `Too many attempts. Try again in ${secondsRemaining} seconds.`
              : submitError
          }
        />
        <Button
          disabled={coolingDown}
          loading={isSubmitting}
          onPress={onSubmit}
        >
          Log in
        </Button>
      </Card>
      <View style={styles.footer}>
        <Text style={styles.footerText}>New to SoloRide? </Text>
        <Link href="/register" style={styles.link}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm, paddingBottom: spacing.xs },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  footerText: { color: colors.muted },
  link: { color: colors.primary, fontWeight: '700' },
});
