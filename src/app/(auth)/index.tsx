import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthApiError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { loginSchema, registerSchema, type LoginValues, type RegisterValues } from '@/auth/schemas';
import { ErrorBanner, Field, Screen } from '@/components/ui';
import { GlassSurface } from '@/components/glass';
import { envConfigurationError } from '@/lib/env';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

const MAX_FAILED_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 30;

type Tab = 'login' | 'register';

// ── Login sub-form ────────────────────────────────────────────────────────────

function LoginForm() {
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
      setSecondsRemaining((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const onSubmit = handleSubmit(async ({ username, password }) => {
    if (secondsRemaining > 0) return;
    setSubmitError(null);
    try {
      await login(username, password);
      haptics.success();
    } catch {
      haptics.error();
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      setSubmitError('That username or password is not correct.');
      if (next >= MAX_FAILED_ATTEMPTS) {
        setFailedAttempts(0);
        setSecondsRemaining(COOLDOWN_SECONDS);
      }
    }
  });

  const coolingDown = secondsRemaining > 0;

  return (
    <View style={styles.formGap}>
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
            placeholder="your_username"
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
            placeholder="••••••••"
            secureTextEntry
            value={value}
          />
        )}
      />
      <ErrorBanner
        message={
          coolingDown
            ? `Too many attempts. Try again in ${secondsRemaining}s.`
            : submitError
        }
      />
      <AuthButton disabled={coolingDown} loading={isSubmitting} onPress={onSubmit}>
        Log in
      </AuthButton>
    </View>
  );
}

// ── Register sub-form ─────────────────────────────────────────────────────────

function RegisterForm() {
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
    } catch (error) {
      if (isAuthApiError(error) && /registered|exists/i.test(error.message)) {
        setSubmitError('That username is already taken.');
      } else if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Could not create that account. Try again later.');
      }
    }
  });

  return (
    <View style={styles.formGap}>
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
            placeholder="your_username"
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
            placeholder="••••••••"
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
            placeholder="••••••••"
            secureTextEntry
            value={value}
          />
        )}
      />
      <Text style={styles.hint}>No email required — just pick a username you'll remember.</Text>
      <ErrorBanner message={submitError} />
      <AuthButton loading={isSubmitting} onPress={onSubmit}>
        Create account
      </AuthButton>
    </View>
  );
}

// ── Shared button ─────────────────────────────────────────────────────────────

function AuthButton({
  children,
  loading = false,
  disabled,
  onPress,
}: {
  children: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authButton,
        pressed && styles.pressed,
        isDisabled && styles.disabledButton,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.authButtonText}>{children}</Text>
      )}
    </Pressable>
  );
}

// ── Landing screen ────────────────────────────────────────────────────────────

export default function AuthLandingScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const isRegister = activeTab === 'register';

  return (
    <Screen centered>
      {/* Brand header — compact on Sign up so the taller form stays centered */}
      <View style={[styles.hero, isRegister && styles.heroCompact]}>
        <View style={[styles.logoWrap, isRegister && styles.logoWrapCompact]}>
          <Image
            accessibilityLabel="Rhodeo"
            resizeMode="contain"
            source={require('../../../assets/Rhodeo-icon.png')}
            style={styles.logo}
          />
        </View>
        <Text style={[styles.brandName, isRegister && styles.brandNameCompact]}>Rhodeo</Text>
        {!isRegister ? (
          <Text style={styles.brandTagline}>Share your ride with the people that matter.</Text>
        ) : null}
      </View>

      {/* Auth card */}
      <GlassSurface style={styles.card}>
        <ErrorBanner message={envConfigurationError} />

        {/* Tab switcher */}
        <View style={styles.tabs}>
          {(['login', 'register'] as Tab[]).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'login' ? 'Log in' : 'Sign up'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Form */}
        {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
      </GlassSurface>

      {/* Legal / spacer */}
      <Text style={styles.legal}>
        By continuing you agree to our{' '}
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/privacy-policy')}
          style={styles.legalLink}
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  heroCompact: { gap: spacing.xs, paddingBottom: 0 },
  logoWrap: {
    borderRadius: radius.lg,
    height: 100,
    overflow: 'hidden',
    width: 100,
  },
  logoWrapCompact: {
    borderRadius: radius.md,
    height: 64,
    width: 64,
  },
  logo: {
    height: '100%',
    width: '100%',
  },
  brandName: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: spacing.xs,
  },
  brandNameCompact: {
    fontSize: 22,
    marginTop: 0,
  },
  brandTagline: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Card
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },

  // Form
  formGap: { gap: spacing.md },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },

  // Auth button
  authButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    ...shadows.glow,
  },
  authButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  pressed: { opacity: 0.82 },
  disabledButton: { opacity: 0.55 },

  legal: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
