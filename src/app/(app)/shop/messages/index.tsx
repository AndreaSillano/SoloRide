import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScrollScreen } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type MessageGroup = {
  id: string;
  title: string;
  preview: string;
  meta: string;
  closesAfter: string;
  unread: number;
  imageUri: string;
};

const GROUPS: MessageGroup[] = [
  {
    id: 'marco-birthday',
    title: 'Marco’s birthday',
    preview: 'Sofia: Hoodie or the photo glass?',
    meta: 'Fratellanza · closes in 12 days',
    closesAfter: 'Marco’s birthday',
    unread: 2,
    imageUri:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&q=80',
  },
  {
    id: 'giulia-birthday',
    title: 'Giulia’s birthday',
    preview: 'You: Caps are ordered 🎁',
    meta: 'Weekend Crew · closes in 28 days',
    closesAfter: 'Giulia’s birthday',
    unread: 0,
    imageUri:
      'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=200&q=80',
  },
  {
    id: 'luca-birthday',
    title: 'Luca’s birthday',
    preview: 'Alex: Secret mug idea…',
    meta: 'Road Trip · closes in 45 days',
    closesAfter: 'Luca’s birthday',
    unread: 1,
    imageUri:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&q=80',
  },
];

export default function ShopMessagesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Messages' }} />

      <ScrollScreen contentStyle={styles.screen}>
        <Text style={styles.hint}>
          Surprise groups for upcoming birthdays. Each chat auto-closes after the day.
        </Text>

        <View style={styles.list}>
          {GROUPS.map((group) => (
            <Pressable
              key={group.id}
              accessibilityRole="button"
              onPress={() => {
                haptics.light();
                router.push({
                  pathname: '/shop/messages/[groupId]',
                  params: { groupId: group.id },
                });
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Image
                contentFit="cover"
                source={{ uri: group.imageUri }}
                style={styles.avatar}
              />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {group.title}
                  </Text>
                  {group.unread > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{group.unread}</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={styles.preview}>
                  {group.preview}
                </Text>
                <View style={styles.metaRow}>
                  <Ionicons color={colors.primary} name="time-outline" size={13} />
                  <Text style={styles.meta}>{group.meta}</Text>
                </View>
              </View>
              <Ionicons color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      </ScrollScreen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    ...shadows.card,
  },
  avatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 56,
    width: 56,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
  },
  unreadText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  preview: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '500',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  meta: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: { opacity: 0.72 },
});
