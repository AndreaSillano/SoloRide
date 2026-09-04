import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet, Host, RNHostView, Switch } from '@expo/ui';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function canUseLiquidGlass() {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

export function GlassSurface({
  children,
  style,
  dark = false,
  isInteractive = false,
  tintColor,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  isInteractive?: boolean;
  tintColor?: string;
}>) {
  if (canUseLiquidGlass()) {
    return (
      <GlassView
        colorScheme={dark ? 'dark' : 'light'}
        glassEffectStyle={dark ? 'clear' : 'regular'}
        isInteractive={isInteractive}
        style={style}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[dark ? styles.fallbackDark : styles.fallbackLight, style]}>{children}</View>
  );
}

export function GlassIconButton({
  accessibilityLabel,
  icon,
  iconSize = 20,
  onPress,
  size = 40,
  color = colors.text,
  dark = false,
  disabled = false,
}: {
  accessibilityLabel: string;
  icon: IconName;
  iconSize?: number;
  onPress: () => void;
  size?: number;
  color?: string;
  dark?: boolean;
  disabled?: boolean;
}) {
  return (
    <GlassSurface
      dark={dark}
      isInteractive
      style={[
        styles.iconButton,
        { borderRadius: size / 2, height: size, width: size },
        disabled && styles.disabled,
      ]}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={6}
        onPress={onPress}
        style={({ pressed }) => [
          styles.iconHit,
          { height: size, width: size },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons color={color} name={icon} size={iconSize} />
      </Pressable>
    </GlassSurface>
  );
}

export function NativeSwitch({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Host
      colorScheme="light"
      matchContents
      seedColor={colors.primary}
      style={styles.switchHost}
    >
      <Switch disabled={disabled} onValueChange={onValueChange} value={value} />
    </Host>
  );
}

export function AppBottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // Expo UI's sheet sizes RN content intrinsically on iOS unless height is
  // explicit — without this, full-height ScrollViews/FlatLists expand with
  // their children and never scroll.
  const { height: windowHeight } = useWindowDimensions();

  return (
    <BottomSheet
      containerColor={colors.background}
      contentPadding={0}
      isPresented={visible}
      onDismiss={onClose}
      showDragIndicator
      snapPoints={['half', 'full']}
    >
      <RNHostView>
        <View style={[styles.sheetFill, { height: windowHeight }]}>{children}</View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fallbackLight: {
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fallbackDark: {
    backgroundColor: colors.glassFillDark,
    borderColor: colors.glassBorderDark,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  // Keep Expo UI switches from collapsing to 0×0 inside scroll layouts.
  switchHost: {
    minHeight: 31,
    minWidth: 51,
  },
  sheetFill: {
    width: '100%',
  },
});
