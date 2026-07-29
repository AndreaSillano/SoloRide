import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import { useComments, useCreateComment, useDeleteComment, formatProfileName } from '@/features/posts';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

import { Avatar, Body } from './ui';

function formatCommentTime(isoDate: string) {
  return new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Instagram-style comments sheet, presented with the platform's own modal
 * chrome (iOS page-sheet card with native swipe-to-dismiss; Android's native
 * full-screen dialog transition) instead of a hand-drawn overlay. */
export function CommentsModal({
  postId,
  rideId,
  visible,
  onClose,
}: {
  postId: string | null;
  rideId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const comments = useComments(postId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const [content, setContent] = useState('');
  // KeyboardAvoidingView is unreliable inside iOS pageSheet modals, so pad the
  // composer from the keyboard's reported height instead.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const submit = async () => {
    const text = content.trim();
    if (!postId || !text) return;
    setContent('');
    try {
      await createComment.mutateAsync({ postId, rideId, content: text });
      haptics.light();
    } catch {
      haptics.error();
      setContent(text);
    }
  };

  const confirmDelete = (commentId: string) => {
    if (!postId) return;
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteComment
            .mutateAsync({ commentId, postId, rideId })
            .then(() => {
              haptics.warning();
            })
            .catch(() => {
              haptics.error();
            });
        },
      },
    ]);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      visible={visible}
    >
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <Pressable
            accessibilityLabel="Close comments"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
          >
            <Ionicons color={colors.muted} name="close" size={24} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
        >
          {comments.isPending ? (
            <ActivityIndicator color={colors.primary} style={styles.spinner} />
          ) : comments.isError ? (
            <Body muted>Comments could not load.</Body>
          ) : comments.data?.length ? (
            comments.data.map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Avatar profile={comment.profile} size={30} />
                <View style={styles.commentText}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.author}>{formatProfileName(comment.profile)}</Text>
                    <Text style={styles.commentTime}>
                      {formatCommentTime(comment.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.content}</Text>
                </View>
                {comment.user_id === user?.id ? (
                  <Pressable
                    accessibilityLabel="Delete comment"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => confirmDelete(comment.id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons color={colors.danger} name="trash-outline" size={18} />
                  </Pressable>
                ) : null}
              </View>
            ))
          ) : (
            <Body muted>No comments yet. Keep it kind and simple.</Body>
          )}
        </ScrollView>

        <View
          style={[
            styles.inputRow,
            {
              paddingBottom:
                keyboardHeight > 0 ? spacing.sm : Math.max(insets.bottom, spacing.sm),
              marginBottom: keyboardHeight,
            },
          ]}
        >
          <TextInput
            maxLength={2000}
            multiline
            onChangeText={setContent}
            placeholder="Add a comment…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={content}
          />
          <Pressable
            accessibilityLabel="Post comment"
            accessibilityRole="button"
            disabled={!content.trim() || createComment.isPending}
            hitSlop={8}
            onPress={() => void submit()}
            style={styles.sendButton}
          >
            {createComment.isPending ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons
                color={content.trim() ? colors.primary : colors.muted}
                name="send"
                size={20}
              />
            )}
          </Pressable>
        </View>
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
  comment: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  commentText: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  commentHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  author: { color: colors.text, fontSize: 14, fontWeight: '700' },
  commentTime: { color: colors.muted, fontSize: 12 },
  commentBody: { color: colors.textSoft, fontSize: 14, lineHeight: 20 },
  deleteButton: { marginTop: 2, padding: spacing.xxs },
  inputRow: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginBottom: 4,
    width: 36,
  },
});
