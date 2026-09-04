import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollScreen } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { colors, radius, shadows, spacing } from '@/theme';

type ChatMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  mine?: boolean;
  imageUri?: string;
};

type GroupDetail = {
  title: string;
  ride: string;
  person: string;
  closesIn: string;
  avatarUri: string;
  messages: ChatMessage[];
};

const GROUPS: Record<string, GroupDetail> = {
  'marco-birthday': {
    title: 'Marco’s birthday',
    ride: 'Fratellanza',
    person: 'Marco',
    closesIn: '12 days',
    avatarUri:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=200&q=80',
    messages: [
      {
        id: '1',
        author: 'Sofia',
        body: 'Ok secret mode on 👀 hoodie or photo glass?',
        time: '09:12',
        imageUri:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
      },
      {
        id: '2',
        author: 'You',
        body: 'Hoodie feels more him. We can print the trip photos.',
        time: '09:14',
        mine: true,
      },
      {
        id: '3',
        author: 'Luca',
        body: 'I’m in for the hoodie. Let’s keep him out of this chat.',
        time: '09:18',
        imageUri:
          'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80',
      },
      {
        id: '4',
        author: 'Sofia',
        body: 'Deal. I’ll draft the text line tonight.',
        time: '09:21',
        imageUri:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
      },
    ],
  },
  'giulia-birthday': {
    title: 'Giulia’s birthday',
    ride: 'Weekend Crew',
    person: 'Giulia',
    closesIn: '28 days',
    avatarUri:
      'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=200&q=80',
    messages: [
      {
        id: '1',
        author: 'You',
        body: 'Caps are ordered 🎁',
        time: 'Yesterday',
        mine: true,
      },
      {
        id: '2',
        author: 'Nina',
        body: 'Perfect. She’ll lose it.',
        time: 'Yesterday',
        imageUri:
          'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80',
      },
    ],
  },
  'luca-birthday': {
    title: 'Luca’s birthday',
    ride: 'Road Trip',
    person: 'Luca',
    closesIn: '45 days',
    avatarUri:
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=200&q=80',
    messages: [
      {
        id: '1',
        author: 'Alex',
        body: 'Secret mug idea… the Amalfi sunrise shot.',
        time: 'Mon',
        imageUri:
          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80',
      },
      {
        id: '2',
        author: 'You',
        body: 'Yes. Add “Good rides only”.',
        time: 'Mon',
        mine: true,
      },
    ],
  },
};

export default function ShopMessageGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const insets = useSafeAreaInsets();
  const group = GROUPS[groupId ?? ''] ?? GROUPS['marco-birthday'];
  const [draft, setDraft] = useState('');

  return (
    <>
      <Stack.Screen options={{ title: group.title }} />

      <View style={styles.root}>
        <ScrollScreen contentStyle={styles.screen}>
          <View style={styles.closeBanner}>
            <Ionicons color={colors.primary} name="hourglass-outline" size={18} />
            <View style={styles.closeBannerCopy}>
              <Text style={styles.closeBannerTitle}>
                Auto-closes after {group.person}’s birthday
              </Text>
              <Text style={styles.closeBannerBody}>
                {group.closesIn} left · {group.ride} stays private until then
              </Text>
            </View>
          </View>

          <View style={styles.thread}>
            {group.messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubbleRow, message.mine && styles.bubbleRowMine]}
              >
                {!message.mine ? (
                  <Image
                    contentFit="cover"
                    source={{ uri: message.imageUri }}
                    style={styles.bubbleAvatar}
                  />
                ) : (
                  <View style={styles.bubbleAvatarSpacer} />
                )}
                <View
                  style={[styles.bubble, message.mine && styles.bubbleMine]}
                >
                  {!message.mine ? (
                    <Text style={styles.bubbleAuthor}>{message.author}</Text>
                  ) : null}
                  <Text
                    style={[styles.bubbleBody, message.mine && styles.bubbleBodyMine]}
                  >
                    {message.body}
                  </Text>
                  <Text
                    style={[styles.bubbleTime, message.mine && styles.bubbleTimeMine]}
                  >
                    {message.time}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollScreen>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            onChangeText={setDraft}
            placeholder="Message the group…"
            placeholderTextColor={colors.muted}
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            onPress={() => {
              haptics.light();
              setDraft('');
            }}
            style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.white} name="send" size={16} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    gap: spacing.md,
    paddingBottom: 100,
    paddingTop: spacing.xs,
  },
  closeBanner: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  closeBannerCopy: {
    flex: 1,
    gap: 2,
  },
  closeBannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  closeBannerBody: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  thread: {
    gap: spacing.sm,
  },
  bubbleRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 28,
    marginBottom: 2,
    width: 28,
  },
  bubbleAvatarSpacer: {
    height: 28,
    width: 28,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: '78%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    ...shadows.card,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bubbleAuthor: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  bubbleBody: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  bubbleBodyMine: {
    color: colors.white,
  },
  bubbleTime: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  bubbleTimeMine: {
    color: 'rgba(255,255,255,0.78)',
  },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  composerInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
    ...shadows.glow,
  },
  pressed: { opacity: 0.72 },
});
