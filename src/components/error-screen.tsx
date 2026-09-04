import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Button } from './ui';

export function ErrorScreen({
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  loading = false,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<unknown>;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void | Promise<unknown>;
  loading?: boolean;
}) {
  const [busyPrimary, setBusyPrimary] = useState(false);
  const [busySecondary, setBusySecondary] = useState(false);
  const primaryLoading = loading || busyPrimary;
  const secondaryLoading = busySecondary;
  const hasPrimary = Boolean(actionLabel && onAction);
  const hasSecondary = Boolean(secondaryActionLabel && onSecondaryAction);
  const showSpinner = primaryLoading || secondaryLoading;

  const runPrimary = async () => {
    if (!onAction || primaryLoading) return;
    setBusyPrimary(true);
    try {
      await onAction();
    } finally {
      setBusyPrimary(false);
    }
  };

  const runSecondary = async () => {
    if (!onSecondaryAction || secondaryLoading) return;
    setBusySecondary(true);
    try {
      await onSecondaryAction();
    } finally {
      setBusySecondary(false);
    }
  };

  return (
    <View accessibilityRole="alert" style={styles.root}>
      <View style={styles.iconPill}>
        {showSpinner ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : (
          <Ionicons color={colors.primary} name="sad-outline" size={48} />
        )}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={styles.message}>{message}</Text>
      {hasPrimary || hasSecondary ? (
        <View style={styles.actions}>
          {hasPrimary ? (
            <Button loading={primaryLoading} onPress={() => void runPrimary()}>
              {actionLabel}
            </Button>
          ) : null}
          {hasSecondary ? (
            <Button
              disabled={primaryLoading}
              loading={secondaryLoading}
              variant="secondary"
              onPress={() => void runSecondary()}
            >
              {secondaryActionLabel}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xl,
  },
  iconPill: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 88,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
