import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TextField from './TextField';
import GradientButton from './GradientButton';
import Avatar from './Avatar';
import { dark, radius, spacing } from '../theme';
import { formatTime } from '../utils/format';

const PRIORITIES = [
  { value: 'high', label: 'High', color: '#F87171' },
  { value: 'med', label: 'Med', color: '#F5B342' },
  { value: 'low', label: 'Low', color: '#17E695' },
];

// Rounds to the next half hour so the default due time is never in the past.
const defaultDueAt = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setMinutes(date.getMinutes() > 30 ? 60 : 30, 0, 0);
  return date;
};

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Bottom sheet for creating a task, either from scratch or pre-filled from a
 * chat message the suggest banner picked up.
 *   suggestion: { title, from: { name }, text, at } | null
 */
const NewTaskSheet = ({ visible, members = [], suggestion, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('high');
  const [assignees, setAssignees] = useState([]);
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed each time the sheet opens so a new suggestion replaces the old draft.
  useEffect(() => {
    if (!visible) return;
    setTitle(suggestion?.title ?? '');
    setPriority('high');
    setAssignees([]);
    setDueAt(defaultDueAt());
    setError('');
    setSaving(false);
  }, [visible, suggestion]);

  const toggleAssignee = (memberId) => {
    setAssignees((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const shiftDate = (days) => {
    setDueAt((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const shiftTime = (minutes) => {
    setDueAt((prev) => {
      const next = new Date(prev);
      next.setMinutes(next.getMinutes() + minutes);
      return next;
    });
  };

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Give the task a title');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        priority,
        assignees,
        dueAt: dueAt.toISOString(),
        source: suggestion?.source,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <Pressable style={styles.sheet}>
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>New Task</Text>
                <Text style={styles.subtitle}>
                  {suggestion ? 'Auto-detected from chat' : 'Add a task for this group'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={dark.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {suggestion?.from && (
                <View style={styles.quote}>
                  <Avatar name={suggestion.from.name} size={28} solid />
                  <View style={styles.quoteBody}>
                    <Text style={styles.quoteMeta}>
                      Mentioned by {suggestion.from.name}
                      {suggestion.at ? ` · ${formatTime(suggestion.at)}` : ''}
                    </Text>
                    <Text style={styles.quoteText} numberOfLines={2}>
                      “{suggestion.text}”
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.label}>Task Title</Text>
              <TextField
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  if (error) setError('');
                }}
                placeholder="What needs doing?"
                error={error || undefined}
              />

              <Text style={styles.label}>Priority</Text>
              <View style={styles.row}>
                {PRIORITIES.map((option) => {
                  const active = priority === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.priority,
                        active && { borderColor: option.color, backgroundColor: `${option.color}1F` },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => setPriority(option.value)}
                    >
                      <View style={[styles.priorityDot, { backgroundColor: option.color }]} />
                      <Text style={[styles.priorityText, active && { color: dark.text }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Assign To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.row}>
                  {members.map((member) => {
                    const active = assignees.includes(member._id);
                    return (
                      <TouchableOpacity
                        key={member._id}
                        activeOpacity={0.8}
                        onPress={() => toggleAssignee(member._id)}
                        style={styles.assignee}
                      >
                        <Avatar
                          name={member.name}
                          size={40}
                          solid
                          style={active ? styles.assigneeActive : styles.assigneeIdle}
                        />
                        {active && <View style={styles.assigneeMark} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.dueRow}>
                <View style={styles.dueColumn}>
                  <Text style={styles.label}>Due Date</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.stepButton}>
                      <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
                    </TouchableOpacity>
                    <View style={styles.stepValue}>
                      <Ionicons name="calendar-outline" size={14} color={dark.accentGreen} />
                      <Text style={styles.stepText}>{dateLabel(dueAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => shiftDate(1)} style={styles.stepButton}>
                      <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.dueColumn}>
                  <Text style={styles.label}>Due Time</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => shiftTime(-30)} style={styles.stepButton}>
                      <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
                    </TouchableOpacity>
                    <View style={styles.stepValue}>
                      <Ionicons name="time-outline" size={14} color={dark.accentGreen} />
                      <Text style={styles.stepText}>{formatTime(dueAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => shiftTime(30)} style={styles.stepButton}>
                      <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>

            <GradientButton
              title="Save Task"
              onPress={submit}
              loading={saving}
              glow
              style={styles.save}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    backgroundColor: '#0C1418',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1 },
  title: { color: dark.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: spacing.md },

  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  quoteBody: { flex: 1, marginLeft: spacing.sm },
  quoteMeta: { color: dark.textMuted, fontSize: 11 },
  quoteText: { color: dark.text, fontSize: 12, fontStyle: 'italic', marginTop: 2 },

  label: {
    color: dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  priority: {
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
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },

  assignee: { position: 'relative' },
  assigneeIdle: { opacity: 0.45 },
  assigneeActive: { opacity: 1 },
  assigneeMark: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.accentGreen,
  },

  dueRow: { flexDirection: 'row', gap: spacing.sm },
  dueColumn: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  stepButton: { paddingHorizontal: 6, paddingVertical: 2 },
  stepValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { color: dark.text, fontSize: 12, fontWeight: '600' },

  save: { marginTop: spacing.sm },
});

export default NewTaskSheet;
