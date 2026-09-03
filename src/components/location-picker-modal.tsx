import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LocationSuggestion } from '@/features/posts';
import { colors, radius, spacing } from '@/theme';

import { AppBottomSheet } from './glass';
import { SheetCloseButton } from './sheet-close-button';

export function LocationPickerModal({
  visible,
  locationQuery,
  selectedLocation,
  suggestions,
  hint,
  locating,
  searching,
  onChangeQuery,
  onPickSuggestion,
  onLocate,
  onClear,
  onClose,
}: {
  visible: boolean;
  locationQuery: string;
  selectedLocation: LocationSuggestion | null;
  suggestions: LocationSuggestion[];
  hint: string | null;
  locating: boolean;
  searching: boolean;
  onChangeQuery: (text: string) => void;
  onPickSuggestion: (suggestion: LocationSuggestion) => void;
  onLocate: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <AppBottomSheet onClose={onClose} visible={visible}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Location</Text>
          <SheetCloseButton accessibilityLabel="Close location picker" onPress={onClose} />
        </View>

        <View style={styles.body}>
          <View style={styles.inputRow}>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              maxLength={200}
              onChangeText={onChangeQuery}
              onSubmitEditing={onClose}
              placeholder="Search or type a place"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              selectionColor={colors.accent}
              style={styles.searchInput}
              value={locationQuery}
            />
            <Pressable
              accessibilityLabel="Use current location"
              accessibilityRole="button"
              disabled={locating}
              onPress={onLocate}
              style={({ pressed }) => [
                styles.locateButton,
                pressed && styles.pressed,
                locating && styles.disabled,
              ]}
            >
              {locating || searching ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons color={colors.primary} name="locate" size={22} />
              )}
            </Pressable>
          </View>

          {selectedLocation ? (
            <View style={styles.pinnedChip}>
              <Ionicons color={colors.primary} name="navigate" size={14} />
              <Text numberOfLines={1} style={styles.pinnedChipText}>
                {selectedLocation.locationName}
              </Text>
              <Pressable
                accessibilityLabel="Clear location"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClear}
              >
                <Ionicons color={colors.muted} name="close-circle" size={18} />
              </Pressable>
            </View>
          ) : null}

          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <ScrollView
            contentContainerStyle={styles.suggestionList}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            style={styles.flex}
          >
            {suggestions.map((suggestion) => (
              <Pressable
                key={`${suggestion.latitude},${suggestion.longitude},${suggestion.locationName}`}
                accessibilityRole="button"
                onPress={() => onPickSuggestion(suggestion)}
                style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}
              >
                <Ionicons color={colors.primary} name="location-outline" size={18} />
                <Text numberOfLines={2} style={styles.suggestionText}>
                  {suggestion.locationName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, width: '100%' },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingRight: spacing.sm,
  },
  body: { flex: 1, gap: spacing.sm, padding: spacing.lg },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locateButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pinnedChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xxs + 2,
  },
  pinnedChipText: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  hint: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  suggestionList: { gap: 0, paddingBottom: spacing.lg },
  suggestionRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  suggestionText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
