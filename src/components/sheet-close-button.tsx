import Ionicons from '@expo/vector-icons/Ionicons';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  GlassView,
} from 'expo-glass-effect';
import { type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function GlassCircleButton({
  accessibilityLabel,
  icon,
  iconSize = 26,
  onPress,
}: {
  accessibilityLabel: string;
  icon: IconName;
  iconSize?: number;
  onPress: () => void;
}) {
  const useLiquidGlass =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  if (useLiquidGlass) {
    return (
      <GlassView isInteractive style={styles.glass}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onPress}
          style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
        >
          <Ionicons color={colors.text} name={icon} size={iconSize} />
        </Pressable>
      </GlassView>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fallback,
        Platform.OS === 'android' && styles.androidElevation,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        color={Platform.OS === 'android' ? colors.text : colors.muted}
        name={icon}
        size={iconSize + 2}
      />
    </Pressable>
  );
}

/** Native sheet dismiss control: liquid-glass X on iOS 26+, Material-style
 * circular close on Android / older iOS. */
export function SheetCloseButton({
  accessibilityLabel = 'Close',
  onPress,
}: {
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <GlassCircleButton
      accessibilityLabel={accessibilityLabel}
      icon="close"
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  glass: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  hit: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  androidElevation: {
    elevation: 1,
  },
  pressed: { opacity: 0.7 },
});
