import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUser } from '@/auth/auth-context';
import {
  extractMentionUsernames,
  formatProfileName,
  getActiveMention,
  insertMentionAt,
  splitCommentMentions,
  useComments,
  useCreateComment,
  useDeleteComment,
} from '@/features/posts';
import { useRideMembers, type RideMember } from '@/features/rides';
import { haptics } from '@/lib/haptics';
import { colors, spacing } from '@/theme';

import { SheetCloseButton } from './sheet-close-button';
import { Avatar, Body } from './ui';

/** Approx. single-line composer height so the list clears the sticky bar. */
const COMPOSER_BAR_HEIGHT = spacing.sm + 40 + spacing.sm;
const SUGGESTION_ROW_HEIGHT = 52;
/** Visible rows before the mention list scrolls (Instagram-like). */
const VISIBLE_SUGGESTION_ROWS = 4;

function formatCommentTime(isoDate: string) {
  return new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CommentBody({
  content,
  knownUsernames,
}: {
  content: string;
  knownUsernames: ReadonlySet<string>;
}) {
  const segments = useMemo(
    () => splitCommentMentions(content, knownUsernames),
    [content, knownUsernames],
  );

  return (
    <Text style={styles.commentBody}>
      {segments.map((segment, index) =>
        segment.type === 'mention' ? (
          <Text key={`${segment.username}-${index}`} style={styles.mention}>
            {segment.value}
          </Text>
        ) : (
          <Text key={`t-${index}`}>{segment.value}</Text>
        ),
      )}
    </Text>
  );
}

function MentionSuggestions({
  members,
  onSelect,
}: {
  members: RideMember[];
  onSelect: (member: RideMember) => void;
}) {
  if (!members.length) return null;

  const listHeight =
    Math.min(members.length, VISIBLE_SUGGESTION_ROWS) * SUGGESTION_ROW_HEIGHT;

  return (
    <View style={styles.suggestions}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{ height: listHeight }}
      >
        {members.map((member) => {
          const username = member.profile?.username ?? '';
          const display = member.profile?.display_name?.trim();
          return (
            <Pressable
              accessibilityLabel={`Mention ${username}`}
              accessibilityRole="button"
              key={member.user_id}
              onPress={() => onSelect(member)}
              style={({ pressed }) => [
                styles.suggestionRow,
                pressed && styles.suggestionRowPressed,
              ]}
            >
              <Avatar profile={member.profile ?? undefined} size={36} />
              <View style={styles.suggestionText}>
                <Text numberOfLines={1} style={styles.suggestionUsername}>
                  {username}
                </Text>
                {display && display.toLowerCase() !== username.toLowerCase() ? (
                  <Text numberOfLines={1} style={styles.suggestionDisplay}>
                    {display}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
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
  const members = useRideMembers(visible ? rideId : null);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Home-indicator padding only when the keyboard is closed; keeping it open
  // leaves a gap between the composer and the keyboard.
  const composerPad = keyboardOpen ? spacing.sm : Math.max(insets.bottom, spacing.sm);

  useEffect(() => {
    if (visible) return;
    setContent('');
    setSelection({ start: 0, end: 0 });
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardOpen(false);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const knownUsernames = useMemo(() => {
    const names = new Set<string>();
    for (const member of members.data ?? []) {
      const username = member.profile?.username?.toLowerCase();
      if (username) names.add(username);
    }
    return names;
  }, [members.data]);

  const activeMention = useMemo(
    () => getActiveMention(content, selection.start),
    [content, selection.start],
  );

  const suggestionMembers = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query;
    return (members.data ?? []).filter((member) => {
      if (member.user_id === user?.id) return false;
      const username = member.profile?.username?.toLowerCase() ?? '';
      const display = member.profile?.display_name?.toLowerCase() ?? '';
      if (!username) return false;
      if (!query) return true;
      return username.includes(query) || display.includes(query);
    });
  }, [activeMention, members.data, user?.id]);

  const resolveMentionedUserIds = (text: string) => {
    const usernames = extractMentionUsernames(text);
    if (!usernames.length) return [] as string[];
    const byUsername = new Map(
      (members.data ?? [])
        .filter((member) => member.profile?.username)
        .map((member) => [member.profile!.username.toLowerCase(), member.user_id]),
    );
    const ids: string[] = [];
    for (const username of usernames) {
      const id = byUsername.get(username);
      if (id && id !== user?.id) ids.push(id);
    }
    return [...new Set(ids)].slice(0, 10);
  };

  const handleChangeText = (next: string) => {
    setContent(next);
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    setSelection(event.nativeEvent.selection);
  };

  const pickMention = (member: RideMember) => {
    const username = member.profile?.username;
    if (!username || !activeMention) return;
    const next = insertMentionAt(content, selection.start, activeMention.start, username);
    setContent(next.text);
    setSelection({ start: next.cursor, end: next.cursor });
    haptics.selection();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({
        selection: { start: next.cursor, end: next.cursor },
      });
    });
  };

  const submit = async () => {
    const text = content.trim();
    if (!postId || !text) return;
    const mentionedUserIds = resolveMentionedUserIds(text);
    setContent('');
    setSelection({ start: 0, end: 0 });
    try {
      await createComment.mutateAsync({
        postId,
        rideId,
        content: text,
        mentionedUserIds,
      });
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

  const suggestionHeight =
    suggestionMembers.length > 0
      ? Math.min(suggestionMembers.length, VISIBLE_SUGGESTION_ROWS) * SUGGESTION_ROW_HEIGHT
      : 0;

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      visible={visible}
    >
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <SheetCloseButton accessibilityLabel="Close comments" onPress={onClose} />
        </View>

        <View style={styles.flex}>
          <ScrollView
            contentContainerStyle={[
              styles.list,
              {
                paddingBottom:
                  COMPOSER_BAR_HEIGHT + composerPad + suggestionHeight + spacing.md,
              },
            ]}
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
                    <CommentBody content={comment.content} knownUsernames={knownUsernames} />
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

          <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.composerSticky}>
            <MentionSuggestions members={suggestionMembers} onSelect={pickMention} />
            <View style={[styles.inputRow, { paddingBottom: composerPad }]}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={2000}
                multiline
                onChangeText={handleChangeText}
                onSelectionChange={handleSelectionChange}
                placeholder="Add a comment…"
                placeholderTextColor={colors.muted}
                ref={inputRef}
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
          </KeyboardStickyView>
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
  mention: { color: colors.accent, fontWeight: '700' },
  deleteButton: { marginTop: 2, padding: spacing.xxs },
  composerSticky: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  suggestions: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    height: SUGGESTION_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  suggestionRowPressed: { backgroundColor: colors.background },
  suggestionText: { flex: 1, gap: 1, minWidth: 0 },
  suggestionUsername: { color: colors.text, fontSize: 14, fontWeight: '700' },
  suggestionDisplay: { color: colors.muted, fontSize: 12 },
  inputRow: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
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
