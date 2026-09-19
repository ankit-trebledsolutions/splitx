import React from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar, { avatarColor } from './Avatar';
import MemberAvatars from './MemberAvatars';
import { dark, radius, spacing } from '../theme';
import { usd, formatTime, formatDateTime } from '../utils/format';
import {
  absoluteUrl,
  canUseVoiceNotes,
  formatDuration,
  messageSnippet,
  prettyBytes,
} from '../utils/attachments';

// Needs the expo-audio native module, which older installed builds don't have.
const VoiceNotePlayer = canUseVoiceNotes() ? require('./VoiceNotePlayer').default : null;

// What people write themselves, as opposed to system lines and activity cards.
export const USER_TYPES = ['text', 'image', 'audio', 'file'];
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const PRIORITY_COLOR = { high: '#F87171', med: '#F5B342', low: '#17E695' };

const CardShell = ({ accent, icon, label, children }) => (
  <View style={styles.card}>
    <View style={[styles.cardHeader, { backgroundColor: `${accent}1F` }]}>
      <Ionicons name={icon} size={13} color={accent} />
      <Text style={[styles.cardHeaderText, { color: accent }]}>{label}</Text>
    </View>
    <View style={styles.cardBody}>{children}</View>
  </View>
);

/**
 * One row of the group chat. Text messages render as bubbles; expenses, tasks
 * and reminders render as activity cards referencing the entity they came from.
 */
const ChatMessage = ({
  message,
  currentUserId,
  // Voice notes and documents: already on this phone / being downloaded now.
  saved = false,
  saving = false,
  onOpenExpense,
  onOpenTask,
  onOpenReminders,
  onOpenImage,
  onOpenFile,
  onSaveFile,
  onLongPress,
  // (messageId) when the quote above a reply is tapped.
  onOpenQuote,
  // Briefly true after someone jumps here from a reply's quote.
  highlighted = false,
}) => {
  const { type, sender } = message;
  const isMine = sender?._id === currentUserId;

  if (type === 'system') {
    return <Text style={styles.system}>{message.text}</Text>;
  }

  // Messages and cards for things I created sit on my side of the chat.
  const wrapper = (content) => (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        highlighted && styles.rowHighlighted,
      ]}
    >
      {!isMine &&
        (sender ? (
          <Avatar name={sender?.name} size={30} solid style={styles.rowAvatar} />
        ) : (
          <View style={styles.rowAvatarSpacer} />
        ))}
      <View style={styles.rowBody}>
        {!isMine && sender && (
          <Text style={[styles.senderName, { color: avatarColor(sender.name) }]}>
            {sender.name}
          </Text>
        )}
        {content}
        <View style={[styles.stampRow, isMine && styles.stampRowMine]}>
          <Text style={styles.stamp}>{formatTime(message.createdAt)}</Text>
          {isMine && !message.deletedAt && (
            <Ionicons
              name={message.pending ? 'time-outline' : 'checkmark-done'}
              size={13}
              color={message.pending ? dark.textMuted : dark.accentGreen}
            />
          )}
        </View>
      </View>
    </View>
  );

  // ---- Messages people write: text, photos, voice notes, documents ---------

  if (USER_TYPES.includes(type)) {
    const bubble = [styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs];
    const ink = isMine ? '#04241A' : dark.text;

    // "Delete for everyone" leaves this behind in place of the message.
    if (message.deletedAt) {
      return wrapper(
        <View style={[styles.bubble, styles.bubbleTheirs, styles.deletedBubble]}>
          <Ionicons name="ban-outline" size={13} color={dark.textMuted} />
          <Text style={styles.deleted}>
            {isMine ? 'You deleted this message' : 'This message was deleted'}
          </Text>
        </View>
      );
    }

    // `pending` marks one of my own uploads still on its way: it shows from the
    // file on the phone (attachment.localUri) until the server's copy replaces it.
    const { pending, attachment } = message;
    if (type !== 'text' && !attachment) return null;

    // Long-press opens the reply / delete sheet (see ChatTab).
    const press = {
      activeOpacity: 0.85,
      delayLongPress: 300,
      onLongPress: pending ? undefined : () => onLongPress?.(message),
    };

    // The message this one answers, quoted at the top of the bubble. Tapping
    // the quote jumps to that message in the feed.
    const quoted = message.replyTo;
    const quote = quoted ? (
      <TouchableOpacity
        style={[styles.quote, isMine && styles.quoteMine]}
        {...press}
        activeOpacity={0.6}
        onPress={() => onOpenQuote?.(quoted._id)}
      >
        <Text
          style={[styles.quoteName, { color: isMine ? '#04241A' : avatarColor(quoted.sender?.name ?? '') }]}
          numberOfLines={1}
        >
          {quoted.sender?._id === currentUserId ? 'You' : quoted.sender?.name ?? 'Message'}
        </Text>
        <Text style={[styles.quoteText, isMine && styles.quoteTextMine]} numberOfLines={2}>
          {messageSnippet(quoted)}
        </Text>
      </TouchableOpacity>
    ) : null;

    const caption = type !== 'text' && message.text ? (
      <Text style={[styles.bubbleText, styles.caption, isMine && styles.bubbleTextMine]}>
        {message.text}
      </Text>
    ) : null;

    // Voice notes and documents: keep a copy on the phone. A tick once saved.
    const saveBadge = pending ? null : (
      <TouchableOpacity
        style={styles.saveBadge}
        activeOpacity={0.7}
        hitSlop={HIT_SLOP}
        disabled={saved || saving}
        onPress={() => onSaveFile?.(message)}
      >
        {saving ? (
          <ActivityIndicator size="small" color={ink} />
        ) : (
          <Ionicons
            name={saved ? 'checkmark-circle' : 'arrow-down-circle-outline'}
            size={24}
            color={ink}
          />
        )}
      </TouchableOpacity>
    );

    if (type === 'text') {
      return wrapper(
        <TouchableOpacity style={bubble} {...press}>
          {quote}
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{message.text}</Text>
        </TouchableOpacity>
      );
    }

    if (type === 'image') {
      const uri = attachment.localUri ?? absoluteUrl(attachment.thumbUrl || attachment.url);
      return wrapper(
        <TouchableOpacity
          style={[bubble, styles.imageBubble, isMine && styles.imageBubbleMine]}
          {...press}
          disabled={pending}
          onPress={() => onOpenImage?.(message)}
        >
          {quote && <View style={styles.imageInset}>{quote}</View>}
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          {pending && (
            <View style={styles.imagePending}>
              <ActivityIndicator color={dark.text} />
            </View>
          )}
          {caption && <View style={[styles.imageInset, styles.imageCaption]}>{caption}</View>}
        </TouchableOpacity>
      );
    }

    if (type === 'audio' && VoiceNotePlayer && !pending) {
      return wrapper(
        <TouchableOpacity style={bubble} {...press}>
          {quote}
          <View style={styles.audioRow}>
            <VoiceNotePlayer
              uri={absoluteUrl(attachment.url)}
              durationMs={attachment.durationMs}
              mine={isMine}
            />
            {saveBadge}
          </View>
          {caption}
        </TouchableOpacity>
      );
    }

    // Documents, plus voice notes that are still sending or that this build
    // can't play: tapping opens the file outside the app.
    const isVoice = type === 'audio';
    return wrapper(
      <TouchableOpacity
        style={bubble}
        {...press}
        disabled={pending}
        onPress={() => onOpenFile?.(message)}
      >
        {quote}
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, isMine && styles.fileIconMine]}>
            {pending ? (
              <ActivityIndicator size="small" color={ink} />
            ) : (
              <Ionicons name={isVoice ? 'mic-outline' : 'document-text-outline'} size={18} color={ink} />
            )}
          </View>
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, { color: ink }]} numberOfLines={2}>
              {isVoice ? 'Voice note' : attachment.name || 'File'}
            </Text>
            <Text style={[styles.fileMeta, isMine && styles.fileMetaMine]} numberOfLines={1}>
              {pending
                ? 'Sending…'
                : isVoice
                  ? formatDuration(attachment.durationMs)
                  : prettyBytes(attachment.size) || 'Tap to open'}
            </Text>
          </View>
          {saveBadge}
        </View>
        {caption}
      </TouchableOpacity>
    );
  }

  // ---- Activity cards -----------------------------------------------------

  if (type === 'expense') {
    const expense = message.expense;
    if (!expense) return wrapper(<Text style={styles.deleted}>This expense was deleted</Text>);

    const myShare = expense.splits?.find((s) => (s.user?._id ?? s.user) === currentUserId);
    const perHead = expense.splits?.length ? expense.amount / expense.splits.length : 0;
    const isEqual = expense.splits?.every((s) => Math.abs(s.amount - perHead) < 0.01);

    return wrapper(
      <CardShell accent={dark.accentGreen} icon="cash-outline" label="EXPENSE ADDED">
        <Text style={styles.cardTitle}>{expense.description}</Text>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Total</Text>
          <Text style={styles.cardValue}>{usd(expense.amount)}</Text>
        </View>
        {myShare && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Your share</Text>
            <Text style={[styles.cardValue, { color: dark.accentGreen }]}>
              {usd(myShare.amount)}
            </Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>
            {isEqual ? 'Split equally' : 'Custom split'} · {expense.splits?.length ?? 0} people
          </Text>
          <TouchableOpacity
            style={styles.viewLink}
            activeOpacity={0.7}
            onPress={() => onOpenExpense?.(expense)}
          >
            <Text style={styles.viewText}>View</Text>
            <Ionicons name="chevron-forward" size={13} color={dark.accentBlue} />
          </TouchableOpacity>
        </View>
      </CardShell>
    );
  }

  if (type === 'task') {
    const task = message.task;
    if (!task) return wrapper(<Text style={styles.deleted}>This task was deleted</Text>);
    const accent = PRIORITY_COLOR[task.priority] ?? dark.accentBlue;

    return wrapper(
      <CardShell accent={accent} icon="checkbox-outline" label="TASK ADDED">
        <Text style={styles.cardTitle}>{task.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>
            {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No due date'}
          </Text>
          {task.assignees?.length ? <MemberAvatars users={task.assignees} size={20} max={4} /> : null}
        </View>
        <TouchableOpacity
          style={styles.viewLink}
          activeOpacity={0.7}
          onPress={() => onOpenTask?.(task)}
        >
          <Text style={styles.viewText}>Open task</Text>
          <Ionicons name="chevron-forward" size={13} color={dark.accentBlue} />
        </TouchableOpacity>
      </CardShell>
    );
  }

  if (type === 'reminder') {
    const reminder = message.reminder;
    if (!reminder) return wrapper(<Text style={styles.deleted}>This reminder was deleted</Text>);

    return wrapper(
      <CardShell accent={dark.accentBlue} icon="alarm-outline" label="REMINDER SET">
        <Text style={styles.cardTitle}>{reminder.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>{formatDateTime(reminder.remindAt)}</Text>
          <TouchableOpacity
            style={styles.viewLink}
            activeOpacity={0.7}
            onPress={() => onOpenReminders?.(reminder)}
          >
            <Text style={styles.viewText}>View</Text>
            <Ionicons name="chevron-forward" size={13} color={dark.accentBlue} />
          </TouchableOpacity>
        </View>
      </CardShell>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  system: {
    color: dark.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },

  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
  rowTheirs: { justifyContent: 'flex-start' },
  rowMine: { justifyContent: 'flex-end' },
  // Marks the message a tapped quote led to. Negative margin + padding lets the
  // tint run a little past the bubble without moving anything.
  rowHighlighted: {
    backgroundColor: 'rgba(0,196,208,0.16)',
    borderRadius: radius.md,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    marginTop: -4,
    paddingTop: 4,
  },
  rowAvatar: { marginRight: spacing.sm },
  rowAvatarSpacer: { width: 30, marginRight: spacing.sm },
  rowBody: { maxWidth: '82%' },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 4 },

  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleTheirs: {
    backgroundColor: '#161D22',
    borderWidth: 1,
    borderColor: dark.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: { backgroundColor: dark.accentGreen, borderBottomRightRadius: 4 },
  bubbleText: { color: dark.text, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#04241A' },

  caption: { marginTop: spacing.sm },
  deletedBubble: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // The quoted message above a reply: a tinted block with a bar down its left.
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: dark.accentGreen,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginBottom: 6,
    minWidth: 120,
  },
  quoteMine: { borderLeftColor: '#04241A', backgroundColor: 'rgba(4,36,26,0.14)' },
  quoteName: { fontSize: 11, fontWeight: '800' },
  quoteText: { color: dark.textMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  quoteTextMine: { color: 'rgba(4,36,26,0.75)' },

  // The photo runs right to the bubble's edge inside a hairline outline; only a
  // quote or caption gets the usual padding.
  imageBubble: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageBubbleMine: { borderColor: 'rgba(0,196,208,0.55)' },
  imageInset: { width: 220, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  image: { width: 220, height: 220, backgroundColor: '#0B1116' },
  imagePending: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  audioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveBadge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  imageCaption: { paddingTop: 0, paddingBottom: spacing.sm },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minWidth: 180 },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconMine: { backgroundColor: 'rgba(4,36,26,0.16)' },
  fileBody: { flexShrink: 1 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },
  fileMetaMine: { color: 'rgba(4,36,26,0.7)' },

  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  stampRowMine: { justifyContent: 'flex-end' },
  stamp: { color: dark.textMuted, fontSize: 10, marginTop: 4 },

  card: {
    backgroundColor: '#12191E',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    minWidth: 230,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  cardHeaderText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  cardBody: { padding: spacing.md },
  cardTitle: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: spacing.sm },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardLabel: { color: dark.textMuted, fontSize: 12 },
  cardValue: { color: dark.text, fontSize: 15, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  cardFootnote: { color: dark.textMuted, fontSize: 11, flexShrink: 1 },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewText: { color: dark.accentBlue, fontSize: 12, fontWeight: '700' },
  deleted: { color: dark.textMuted, fontSize: 12, fontStyle: 'italic' },
});

// Memoised: a new message must not re-render every row already on screen.
export default React.memo(ChatMessage);
