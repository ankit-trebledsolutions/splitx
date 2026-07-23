import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar, { avatarColor } from './Avatar';
import MemberAvatars from './MemberAvatars';
import { dark, radius, spacing } from '../theme';
import { usd, formatTime, formatDateTime } from '../utils/format';

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
const ChatMessage = ({ message, currentUserId, onOpenExpense, onOpenTask, onOpenReminders }) => {
  const { type, sender } = message;
  const isMine = sender?._id === currentUserId;

  if (type === 'system') {
    return <Text style={styles.system}>{message.text}</Text>;
  }

  if (type === 'text') {
    return (
      <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
        {!isMine && <Avatar name={sender?.name} size={30} solid style={styles.rowAvatar} />}
        <View style={styles.rowBody}>
          {!isMine && (
            <Text style={[styles.senderName, { color: avatarColor(sender?.name ?? '') }]}>
              {sender?.name}
            </Text>
          )}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{message.text}</Text>
          </View>
          <View style={[styles.stampRow, isMine && styles.stampRowMine]}>
            <Text style={styles.stamp}>{formatTime(message.createdAt)}</Text>
            {isMine && <Ionicons name="checkmark-done" size={13} color={dark.accentGreen} />}
          </View>
        </View>
      </View>
    );
  }

  // ---- Activity cards -----------------------------------------------------

  const wrapper = (content) => (
    <View style={[styles.row, styles.rowTheirs]}>
      {sender ? (
        <Avatar name={sender?.name} size={30} solid style={styles.rowAvatar} />
      ) : (
        <View style={styles.rowAvatarSpacer} />
      )}
      <View style={styles.rowBody}>
        {sender && (
          <Text style={[styles.senderName, { color: avatarColor(sender.name) }]}>
            {sender.name}
          </Text>
        )}
        {content}
        <Text style={styles.stamp}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  );

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

export default ChatMessage;
