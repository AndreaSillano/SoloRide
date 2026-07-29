import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { firstGrapheme, isEmojiGrapheme, REACTION_OPTIONS } from '@/features/posts';
import { colors, spacing } from '@/theme';

const CELL = 72;

/** Dark in-photo overlay with a centered 3×2 emoji grid + custom entry. */
export function ReactionPicker({
  visible,
  selectedEmoji,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedEmoji?: string | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setCustomMode(false);
      setCustomValue('');
      setCustomError(false);
    }
  }, [visible]);

  useEffect(() => {
    if (customMode) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [customMode]);

  if (!visible) return null;

  const customEmoji = firstGrapheme(customValue);
  const customIsValid = Boolean(customEmoji && isEmojiGrapheme(customEmoji));

  const submitCustom = () => {
    const emoji = firstGrapheme(customValue);
    if (!emoji || !isEmojiGrapheme(emoji)) {
      setCustomError(true);
      return;
    }
    setCustomError(false);
    onSelect(emoji);
  };

  // 5 presets + custom = full 3×2 grid (no empty cells).
  const cells: Array<{ type: 'preset'; emoji: string } | { type: 'custom' }> = [
    ...REACTION_OPTIONS.map((emoji) => ({ type: 'preset' as const, emoji: emoji as string })),
    { type: 'custom' as const },
  ];

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityLabel="Dismiss reaction picker"
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={styles.center}>
        {customMode ? (
          <Pressable onPress={() => undefined} style={styles.customPanel}>
            <Text style={styles.customHint}>Pick any emoji</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={16}
              onChangeText={(value) => {
                setCustomValue(value);
                setCustomError(false);
              }}
              onSubmitEditing={submitCustom}
              placeholder="😊"
              placeholderTextColor="rgba(255,255,255,0.45)"
              ref={inputRef}
              returnKeyType="done"
              style={styles.customInput}
              value={customValue}
            />
            {customError ? (
              <Text style={styles.customError}>Enter an emoji, not text</Text>
            ) : null}
            <View style={styles.customActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCustomMode(false);
                  setCustomValue('');
                  setCustomError(false);
                }}
                style={({ pressed }) => [styles.customButton, pressed && styles.pressed]}
              >
                <Text style={styles.customButtonText}>Back</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!customIsValid}
                onPress={submitCustom}
                style={({ pressed }) => [
                  styles.customButton,
                  pressed && styles.pressed,
                  !customIsValid && styles.disabled,
                ]}
              >
                <Text style={styles.customButtonText}>Use</Text>
              </Pressable>
            </View>
          </Pressable>
        ) : (
          <View style={styles.grid}>
            {cells.map((cell) => {
              if (cell.type === 'custom') {
                return (
                  <Pressable
                    accessibilityLabel="Choose a custom emoji"
                    accessibilityRole="button"
                    key="custom"
                    onPress={() => setCustomMode(true)}
                    style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                  >
                    <Text style={styles.customGlyph}>+</Text>
                  </Pressable>
                );
              }
              const selected = selectedEmoji === cell.emoji;
              return (
                <Pressable
                  accessibilityLabel={`React with ${cell.emoji}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={cell.emoji}
                  onPress={() => onSelect(cell.emoji)}
                  style={({ pressed }) => [
                    styles.cell,
                    selected && styles.cellSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emoji}>{cell.emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 5,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    width: CELL * 3 + spacing.md * 2,
  },
  cell: {
    alignItems: 'center',
    height: CELL,
    justifyContent: 'center',
    width: CELL,
  },
  cellSelected: {
    transform: [{ scale: 1.12 }],
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  customGlyph: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '300',
    lineHeight: 44,
    textAlign: 'center',
  },
  customPanel: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    width: '80%',
  },
  customHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
  },
  customInput: {
    color: colors.white,
    fontSize: 44,
    minHeight: 64,
    textAlign: 'center',
    width: '100%',
  },
  customError: {
    color: '#ffb4a8',
    fontSize: 13,
    fontWeight: '600',
  },
  customActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  customButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.4 },
});
