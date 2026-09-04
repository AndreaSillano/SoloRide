import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChallengeCatalogItem } from '@/features/challenges';
import { colors, radius, spacing } from '@/theme';

import { ChallengeHatIcon } from './challenge-hat-icon';
import { AppBottomSheet } from './glass';
import { SheetCloseButton } from './sheet-close-button';

export function ChallengePickerModal({
  visible,
  challenges,
  loading = false,
  selecting = false,
  onSelect,
  onClose,
}: {
  visible: boolean;
  challenges: ChallengeCatalogItem[];
  loading?: boolean;
  selecting?: boolean;
  onSelect: (challenge: ChallengeCatalogItem) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return challenges;
    return challenges.filter((item) => {
      const haystack = `${item.title} ${item.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [challenges, query]);

  return (
    <AppBottomSheet onClose={onClose} visible={visible}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Open challenge</Text>
          <SheetCloseButton accessibilityLabel="Close challenge picker" onPress={onClose} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons color={colors.muted} name="search" size={18} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            clearButtonMode="while-editing"
            onChangeText={setQuery}
            placeholder="Search challenges"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            selectionColor={colors.accent}
            style={styles.searchInput}
            value={query}
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptyText}>Loading catalog…</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.xl },
            ]}
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query.trim() ? 'No challenges match that search.' : 'No challenges available.'}
              </Text>
            }
            nestedScrollEnabled
            renderItem={({ item }) => (
              <Pressable
                accessibilityLabel={`${item.title}. ${item.description}`}
                accessibilityRole="button"
                disabled={selecting}
                onPress={() => onSelect(item)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.pressed,
                  selecting && styles.disabled,
                ]}
              >
                <View style={styles.trophyWrap}>
                  <ChallengeHatIcon color={colors.primary} size={16} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowEyebrow}>Photo Challenge</Text>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text numberOfLines={2} style={styles.rowMeta}>
                    {item.description}
                  </Text>
                </View>
                <Ionicons color={colors.muted} name="chevron-forward" size={18} />
              </Pressable>
            )}
            style={styles.listFlex}
          />
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
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
  searchRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: spacing.sm,
  },
  listFlex: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  trophyWrap: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  rowEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
