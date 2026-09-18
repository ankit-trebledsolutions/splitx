import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatMessage from '../../components/ChatMessage';
import TypingDots from '../../components/TypingDots';
import { avatarColor } from '../../components/Avatar';
import useKeyboardVisible from '../../hooks/useKeyboardVisible';
import useKeyboardLift from '../../hooks/useKeyboardLift';
import { dark, radius, spacing } from '../../theme';
import { formatDayDivider } from '../../utils/format';

// Height of the composer bar above its bottom padding: 10 top padding + 42 controls.
// The parent uses it to float its "+" button just above the bar.
export const COMPOSER_HEIGHT = 52;
export const composerBottomPadding = (insets) => Math.max(insets.bottom, spacing.sm + 4);

// iOS keeps KeyboardAvoidingView; Android lifts the bar itself (see useKeyboardLift).
const IS_IOS = Platform.OS === 'ios';
const Root = IS_IOS ? KeyboardAvoidingView : View;

// How far up (px) the reader has to be before the "jump to latest" button shows.
const JUMP_BUTTON_AFTER = 400;

/**
 * Chat feed + composer. The suggest banner is driven by the parent so the
 * detected task can be handed straight to the New Task sheet.
 *
 * The feed is an inverted list: index 0 is the newest message, pinned to the
 * bottom. That makes the chat open on the latest message with no scrolling,
 * new messages slide in at the bottom on their own, and older pages load when
 * the reader reaches the top.
 */
const ChatTab = ({
  messages,
  loading,
  loadingOlder = false,
  onLoadOlder,
  onOpenCamera,
  // True while the parent's floating "+" sits over the feed's bottom-right corner.
  fabVisible = false,
  currentUserId,
  suggestion,
  onDismissSuggestion,
  onAddSuggestionToTasks,
  onRemindSuggestion,
  onSend,
  onTyping,
  typingUsers = [],
  onOpenExpense,
  onOpenTask,
  onOpenReminders,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const listRef = useRef(null);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { lift, onLayout } = useKeyboardLift();

  // Newest first, with each day's divider placed after that day's messages so
  // the inverted list draws it above them.
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (const message of messages) {
      const day = new Date(message.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ _id: `divider-${day}`, divider: formatDayDivider(message.createdAt) });
        lastDay = day;
      }
      out.push(message);
    }
    return out.reverse();
  }, [messages]);

  // A message that arrives while the reader is scrolled up lights the jump button.
  const newestId = messages.length ? messages[messages.length - 1]._id : null;
  const awayRef = useRef(false);
  useEffect(() => {
    if (awayRef.current && newestId) setUnseen(true);
  }, [newestId]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnseen(false);
  }, []);

  const onScroll = useCallback((event) => {
    const away = event.nativeEvent.contentOffset.y > JUMP_BUTTON_AFTER;
    if (away === awayRef.current) return;
    awayRef.current = away;
    setAwayFromLatest(away);
    if (!away) setUnseen(false);
  }, []);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    onTyping?.(false);
    setSending(true);
    setDraft('');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  };

  // The parent passes fresh closures every render; routing them through a ref
  // keeps renderRow stable so memoised rows don't all re-render per message.
  const handlers = useRef({});
  handlers.current = { onOpenExpense, onOpenTask, onOpenReminders };
  const openExpense = useCallback((...args) => handlers.current.onOpenExpense?.(...args), []);
  const openTask = useCallback((...args) => handlers.current.onOpenTask?.(...args), []);
  const openReminders = useCallback((...args) => handlers.current.onOpenReminders?.(...args), []);

  const renderRow = useCallback(
    ({ item }) => {
      if (item.divider) {
        return (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{item.divider}</Text>
            <View style={styles.dividerLine} />
          </View>
        );
      }
      return (
        <ChatMessage
          message={item}
          currentUserId={currentUserId}
          onOpenExpense={openExpense}
          onOpenTask={openTask}
          onOpenReminders={openReminders}
        />
      );
    },
    [currentUserId, openExpense, openTask, openReminders]
  );

  return (
    <Root
      style={[styles.flex, !IS_IOS && { paddingBottom: lift }]}
      {...(IS_IOS ? { behavior: 'padding', keyboardVerticalOffset: 90 } : { onLayout })}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.flex}>
          <Text style={styles.empty}>No messages yet — say hello to your group.</Text>
        </View>
      ) : (
        <View style={styles.flex}>
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={keyOf}
            renderItem={renderRow}
            // Inverted, so paddingTop is the gap under the newest message: enough
            // to keep it clear of the floating button.
            contentContainerStyle={[styles.list, fabVisible && !keyboardVisible && styles.listUnderFab]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={onScroll}
            scrollEventThrottle={64}
            onEndReached={onLoadOlder}
            onEndReachedThreshold={0.4}
            // Keeps the reader's place when messages arrive or older ones load,
            // and follows new messages when they're already near the bottom.
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            initialNumToRender={14}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={dark.accentGreen} style={styles.older} /> : null
            }
          />

          {awayFromLatest && (
            <TouchableOpacity
              style={[styles.jump, fabVisible && !keyboardVisible && styles.jumpAboveFab]}
              activeOpacity={0.85}
              onPress={jumpToLatest}
            >
              <Ionicons name="chevron-down" size={18} color={dark.text} />
              {unseen && <View style={styles.jumpDot} />}
            </TouchableOpacity>
          )}
        </View>
      )}

      {suggestion && (
        <View style={styles.suggest}>
          <View style={styles.suggestHeader}>
            <View style={styles.suggestBadge}>
              <Ionicons name="sparkles" size={11} color="#04121C" />
            </View>
            <Text style={styles.suggestTitle}>SPLIX SUGGEST</Text>
            <TouchableOpacity onPress={onDismissSuggestion} hitSlop={styles.hitSlop}>
              <Ionicons name="close" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.suggestBody}>
            Looks like a task was mentioned — “
            <Text style={styles.suggestQuote}>{suggestion.title}</Text>”
          </Text>

          <View style={styles.suggestActions}>
            <TouchableOpacity
              style={styles.suggestPrimary}
              activeOpacity={0.85}
              onPress={onAddSuggestionToTasks}
            >
              <Ionicons name="checkbox-outline" size={15} color="#04241A" />
              <Text style={styles.suggestPrimaryText}>Add to Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.suggestSecondary}
              activeOpacity={0.85}
              onPress={onRemindSuggestion}
            >
              <Ionicons name="alarm-outline" size={15} color={dark.text} />
              <Text style={styles.suggestSecondaryText}>Remind</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {typingUsers.length > 0 && (
        <TypingDots
          style={styles.typing}
          label={typingLabel(typingUsers)}
          labelColor={typingUsers.length === 1 ? avatarColor(typingUsers[0]) : undefined}
        />
      )}

      {/* Clear the gesture bar when resting at the bottom; sit tight on the keyboard otherwise. */}
      <View
        style={[
          styles.composer,
          { paddingBottom: keyboardVisible ? spacing.sm + 2 : composerBottomPadding(insets) },
        ]}
      >
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="attach" size={20} color={dark.textMuted} />
        </TouchableOpacity>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              onTyping?.(value.trim().length > 0);
            }}
            placeholder="Message..."
            placeholderTextColor={dark.textMuted}
            multiline
            onSubmitEditing={submit}
          />
          <Ionicons name="happy-outline" size={18} color={dark.textMuted} />
        </View>

        {draft.trim() ? (
          <TouchableOpacity style={styles.sendButton} onPress={submit} activeOpacity={0.85}>
            <Ionicons name="send" size={17} color="#04241A" />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} onPress={onOpenCamera}>
              <Ionicons name="camera-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </Root>
  );
};

const keyOf = (item) => item._id;

// "Alex" / "Alex & Sam" / "Alex, Sam & 2 others"
const typingLabel = (names) => {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} & ${others} other${others === 1 ? '' : 's'}`;
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listUnderFab: { paddingTop: 76 },
  older: { paddingVertical: spacing.md },
  jump: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpAboveFab: { bottom: 84, right: spacing.lg + 9 },
  jumpDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dark.accentGreen,
    borderWidth: 2,
    borderColor: dark.card2,
  },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  empty: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
  typing: { marginLeft: spacing.md, marginBottom: spacing.sm },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: dark.border },
  dividerText: { color: dark.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  suggest: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#0F1A20',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  suggestHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestTitle: {
    flex: 1,
    color: dark.accentGreen,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  suggestBody: { color: dark.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  suggestQuote: { color: dark.text, fontWeight: '700' },
  suggestActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  suggestPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: dark.accentGreen,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  suggestPrimaryText: { color: '#04241A', fontSize: 13, fontWeight: '700' },
  suggestSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
  },
  suggestSecondaryText: { color: dark.text, fontSize: 13, fontWeight: '600' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: '#080D10',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 21,
    minHeight: 42,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.md - 2,
    paddingVertical: 6,
  },
  // Android adds its own text padding and baseline offset; zero them so the
  // text sits centred in the pill at one line and grows evenly after that.
  input: {
    flex: 1,
    color: dark.text,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 100,
    padding: 0,
    paddingVertical: 5,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatTab;
