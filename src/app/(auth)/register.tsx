import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthApiError } from '@supabase/supabase-js';
import { Camera } from 'expo-camera';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import {
  registerSchema,
  type RegisterValues,
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
import {
  requestNotificationRefresh,
  requestSoloRideNotificationPermission,
} from '@/features/notifications';
import { colors, spacing } from '@/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setSubmitError(null);
    try {
      await register(username, password);
      // Ask once at signup so Camera and reminders work without later prompts.
      // Denials must not block account creation.
      await Camera.requestCameraPermissionsAsync().catch(() => undefined);
      await requestSoloRideNotificationPermission().catch(() => undefined);
      requestNotificationRefresh();
    } catch (error) {
      if (isAuthApiError(error) && /registered|exists/i.test(error.message)) {
        setSubmitError('That username is already taken.');
      } else if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError(
          'We could not create that account. Try another username or try again later.',
        );
      }
    }
  });

  return (
    <Screen>
      <View style={styles.intro}>
        <AppMark compact />
        <Eyebrow>Your private space</Eyebrow>
        <Heading>Create your account.</Heading>
        <Body muted>Choose a username you’ll remember. No email required.</Body>
      </View>
      <Card>
        <Controller
          control={control}
          name="username"
          render={({ field: { onBlur, onChange, value } }) => (
            <Field
              autoComplete="username-new"
              error={errors.username?.message}
              label="Username"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value } }) => (
            <Field
              autoComplete="new-password"
              error={errors.password?.message}
              label="Password"
              onBlur={onBlur}
              onChangeText={onChange}
              secureTextEntry
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onBlur, onChange, value } }) => (
            <Field
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              label="Confirm password"
              onBlur={onBlur}
              onChangeText={onChange}
              onSubmitEditing={onSubmit}
              secureTextEntry
              value={value}
            />
          )}
        />
        <ErrorBanner message={submitError} />
        <Button loading={isSubmitting} onPress={onSubmit}>
          Create account
        </Button>
      </Card>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" style={styles.link}>
          Log in
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
