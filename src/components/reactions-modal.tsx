import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatProfileName, reactionScoreToSize, useReactions } from '@/features/posts';
import { colors, spacing } from '@/theme';

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
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      visible={visible}
    >
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Reactions</Text>
          <Pressable
            accessibilityLabel="Close reactions"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
          >
            <Ionicons color={colors.muted} name="close" size={24} />
          </Pressable>
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
                <MaterialIcons
                  color={colors.text}
                  name={reaction.score > 0 ? 'thumb-up' : 'thumb-down'}
                  size={reactionScoreToSize(reaction.score)}
                />
              </View>
            ))
          ) : (
            <Body muted>No reactions yet. Double-tap a photo to react.</Body>
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
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  list: { gap: spacing.md, padding: spacing.lg },
  spinner: { paddingTop: spacing.lg },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  text: { flex: 1, gap: 2, minWidth: 0 },
  author: { color: colors.text, fontSize: 14, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 12 },
});
