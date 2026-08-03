import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GradientButton from './GradientButton';
import { dark, radius, spacing } from '../theme';
import { formatDateTime } from '../utils/format';

// Confirmation shown after a task is saved, offering to chain a reminder onto it.
const TaskSavedModal = ({ visible, task, onSetReminder, onDismiss }) => {
  const assignedTo = task?.assignees?.length
    ? task.assignees.map((a) => a.name?.split(' ')[0]).join(', ')
    : 'everyone';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card}>
          <View style={styles.checkRing}>
            <View style={styles.checkInner}>
              <Ionicons name="checkmark" size={26} color="#04121C" />
            </View>
          </View>

          <Text style={styles.title}>Task saved! 🎉</Text>
          <Text style={styles.quote} numberOfLines={2}>
            “{task?.title}”
          </Text>
          <Text style={styles.meta}>
            Assigned to {assignedTo}
            {task?.dueAt ? ` · Due ${formatDateTime(task.dueAt)}` : ''}
          </Text>

          <View style={styles.divider} />

          <View style={styles.promptRow}>
            <View style={styles.promptIcon}>
              <Ionicons name="alarm-outline" size={16} color={dark.accentBlue} />
            </View>
            <Text style={styles.promptTitle}>Add a reminder too?</Text>
          </View>
          <Text style={styles.promptBody}>
            We&apos;ll notify you before the due date so nothing slips through.
          </Text>

          <GradientButton
            title="⏰  Yes, set a reminder"
            onPress={onSetReminder}
            style={styles.primary}
          />
          <TouchableOpacity style={styles.secondary} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.secondaryText}>Maybe later</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: '#0C1418',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 24,
    padding: spacing.lg,
    alignItems: 'center',
  },
  checkRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(0,196,208,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: dark.text, fontSize: 20, fontWeight: '800', marginTop: spacing.md },
  quote: {
    color: dark.text,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  meta: {
    color: dark.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: dark.border,
    marginVertical: spacing.md,
  },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  promptIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(74,125,247,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTitle: { color: dark.text, fontSize: 15, fontWeight: '700' },
  promptBody: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  primary: { alignSelf: 'stretch' },
  secondary: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryText: { color: dark.text, fontSize: 15, fontWeight: '600' },
});

export default TaskSavedModal;
