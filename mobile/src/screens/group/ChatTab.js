import React, { useMemo, useRef, useState } from 'react';
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
import ChatMessage from '../../components/ChatMessage';
import { dark, radius, spacing } from '../../theme';
import { formatDayDivider } from '../../utils/format';

/**
 * Chat feed + composer. The suggest banner is driven by the parent so the
 * detected task can be handed straight to the New Task sheet.
 */
const ChatTab = ({
  messages,
  loading,
  currentUserId,
  suggestion,
  onDismissSuggestion,
  onAddSuggestionToTasks,
  onRemindSuggestion,
  onSend,
  onOpenExpense,
  onOpenTask,
  onOpenReminders,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  // Interleave day dividers into the message list.
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
    return out;
  }, [messages]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  };

  const renderRow = ({ item }) => {
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
        onOpenExpense={onOpenExpense}
        onOpenTask={onOpenTask}
        onOpenReminders={onOpenReminders}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item._id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>No messages yet — say hello to your group.</Text>
          }
        />
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

      <View style={styles.composer}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
          <Ionicons name="attach" size={20} color={dark.textMuted} />
        </TouchableOpacity>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
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
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  empty: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },

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
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: '#080D10',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  input: { flex: 1, color: dark.text, fontSize: 14, maxHeight: 96, padding: 0 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatTab;
