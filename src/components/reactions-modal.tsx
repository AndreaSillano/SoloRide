import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatProfileName,
  reactionEmojiForScore,
  reactionScoreToSize,
  useReactions,
} from '@/features/posts';
import { colors, spacing } from '@/theme';

import { SheetCloseButton } from './sheet-close-button';
import { Avatar, Body } from './ui';

function formatReactionTime(isoDate: string) {
  return new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ReactionsModal({
  postId,
  visible,
  onClose,
}: {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const reactions = useReactions(postId);

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      visible={visible}
    >
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Reactions</Text>
          <SheetCloseButton accessibilityLabel="Close reactions" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.list} style={styles.flex}>
          {reactions.isPending ? (
            <ActivityIndicator color={colors.primary} style={styles.spinner} />
          ) : reactions.isError ? (
            <Body muted>Reactions could not load.</Body>
          ) : reactions.data?.length ? (
            reactions.data.map((reaction) => (
              <View key={reaction.id} style={styles.row}>
                <Avatar profile={reaction.profile} size={34} />
                <View style={styles.text}>
                  <Text style={styles.author}>{formatProfileName(reaction.profile)}</Text>
                  <Text style={styles.time}>{formatReactionTime(reaction.created_at)}</Text>
                </View>
                <Text
                  style={{
                    fontSize: reactionScoreToSize(reaction.score),
                    lineHeight: reactionScoreToSize(reaction.score) + 4,
                  }}
                >
                  {reactionEmojiForScore(reaction.score)}
                </Text>
              </View>
            ))
          ) : (
            <Body muted>No reactions yet. Double-tap or long-press a photo to react.</Body>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.surface, flex: 1 },
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
  list: { gap: spacing.md, padding: spacing.lg },
  spinner: { paddingTop: spacing.lg },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  text: { flex: 1, gap: 2, minWidth: 0 },
  author: { color: colors.text, fontSize: 14, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 12 },
});
