import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import Avatar from '../components/Avatar';
import { fetchTask, updateTask, deleteTask } from '../api/tasks.api';
import { dark, radius, spacing } from '../theme';

const PRIORITY = {
  high: { label: 'HIGH PRIORITY', color: '#F87171' },
  med: { label: 'MED PRIORITY', color: '#F5B342' },
  low: { label: 'LOW PRIORITY', color: '#17E695' },
};

const dueLabel = (value) => {
  if (!value) return 'No due date';
  const date = new Date(value);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const stamp = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return sameDay ? `Today, ${stamp}` : stamp;
};

// Full task view per the task-detail mockup: chips, due/assignee boxes, notes,
// checkable subtasks, links, and Mark as Done.
const TaskDetailScreen = ({ route, navigation }) => {
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const data = await fetchTask(taskId);
          if (active) setTask(data);
        } catch (err) {
          Alert.alert('Could not load task', err.message);
          navigation.goBack();
        }
      })();
      return () => {
        active = false;
      };
    }, [taskId, navigation])
  );

  const patchTask = async (payload, revert) => {
    try {
      const updated = await updateTask(taskId, payload);
      setTask(updated);
    } catch (err) {
      if (revert) setTask(revert);
      Alert.alert('Could not update task', err.message);
    }
  };

  const toggleSubtask = (index) => {
    const before = task;
    const subtasks = task.subtasks.map((s, i) =>
      i === index ? { ...s, done: !s.done } : s
    );
    setTask({ ...task, subtasks });
    patchTask(
      { subtasks: subtasks.map((s) => ({ title: s.title, done: s.done })) },
      before
    );
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setNewSubtask('');
    const subtasks = [...(task.subtasks ?? []), { title, done: false }];
    const before = task;
    setTask({ ...task, subtasks });
    patchTask(
      { subtasks: subtasks.map((s) => ({ title: s.title, done: s.done })) },
      before
    );
  };

  const toggleDone = async () => {
    setBusy(true);
    try {
      const updated = await updateTask(taskId, {
        status: task.status === 'done' ? 'open' : 'done',
      });
      setTask(updated);
    } catch (err) {
      Alert.alert('Could not update task', err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete task', `Delete "${task.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(taskId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not delete task', err.message);
          }
        },
      },
    ]);
  };

  if (!task) {
    return (
      <DarkScreen>
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      </DarkScreen>
    );
  }

  const priority = PRIORITY[task.priority] ?? PRIORITY.med;
  const isDone = task.status === 'done';
  const assignee = task.assignees?.[0];
  const doneCount = task.subtasks?.filter((s) => s.done).length ?? 0;

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Task Details</Text>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={confirmDelete}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={dark.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{task.title}</Text>

        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: `${priority.color}1F` }]}>
            <Text style={[styles.chipText, { color: priority.color }]}>{priority.label}</Text>
          </View>
          <View
            style={[
              styles.chip,
              { backgroundColor: isDone ? 'rgba(23,230,149,0.14)' : 'rgba(245,179,66,0.14)' },
            ]}
          >
            <Text style={[styles.chipText, { color: isDone ? dark.accentGreen : '#F5B342' }]}>
              {isDone ? 'DONE' : 'PENDING'}
            </Text>
          </View>
        </View>

        <View style={styles.boxRow}>
          <View style={styles.infoBox}>
            <Text style={styles.boxLabel}>DUE DATE</Text>
            <View style={styles.boxValueRow}>
              <Ionicons name="calendar-outline" size={13} color="#F5B342" />
              <Text style={styles.boxValue}>{dueLabel(task.dueAt)}</Text>
            </View>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.boxLabel}>ASSIGNEE</Text>
            <View style={styles.boxValueRow}>
              {assignee ? (
                <>
                  <Avatar name={assignee.name} size={18} solid />
                  <Text style={styles.boxValue} numberOfLines={1}>
                    {assignee.name}
                  </Text>
                </>
              ) : (
                <Text style={styles.boxValueMuted}>Unassigned</Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>DESCRIPTION & NOTES</Text>
        <View style={styles.notesCard}>
          <Text style={task.notes ? styles.notesText : styles.notesEmpty}>
            {task.notes ||
              (task.source?.text
                ? `From chat: “${task.source.text}”`
                : 'No notes added for this task yet.')}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>SUBTASKS</Text>
          {task.subtasks?.length ? (
            <Text style={styles.sectionMeta}>
              {doneCount} of {task.subtasks.length} completed
            </Text>
          ) : null}
        </View>

        {(task.subtasks ?? []).map((subtask, index) => (
          <TouchableOpacity
            key={subtask._id ?? index}
            style={styles.subtaskRow}
            activeOpacity={0.8}
            onPress={() => toggleSubtask(index)}
          >
            <View style={[styles.checkbox, subtask.done && styles.checkboxDone]}>
              {subtask.done && <Ionicons name="checkmark" size={12} color="#04241A" />}
            </View>
            <Text style={[styles.subtaskText, subtask.done && styles.subtaskTextDone]}>
              {subtask.title}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.addSubtaskRow}>
          <TextInput
            style={styles.addSubtaskInput}
            value={newSubtask}
            onChangeText={setNewSubtask}
            placeholder="Add a subtask…"
            placeholderTextColor={dark.textMuted}
            onSubmitEditing={addSubtask}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addSubtaskButton} activeOpacity={0.8} onPress={addSubtask}>
            <Ionicons name="add" size={16} color={dark.accentGreen} />
          </TouchableOpacity>
        </View>

        {task.links?.length ? (
          <>
            <Text style={styles.sectionLabel}>ATTACHMENTS & LINKS</Text>
            {task.links.map((link, index) => (
              <TouchableOpacity
                key={link._id ?? index}
                style={styles.linkRow}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(link.url).catch(() => {})}
              >
                <View style={styles.linkIcon}>
                  <Ionicons name="link-outline" size={15} color={dark.accentBlue} />
                </View>
                <View style={styles.linkBody}>
                  <Text style={styles.linkTitle} numberOfLines={1}>
                    {link.title || link.url}
                  </Text>
                  <Text style={styles.linkUrl} numberOfLines={1}>
                    {link.url.replace(/^https?:\/\//, '')}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={14} color={dark.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          title={isDone ? 'Reopen Task' : '✓ Mark as Done'}
          onPress={toggleDone}
          loading={busy}
        />
      </View>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 16,
    fontWeight: '800',
  },

  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  title: { color: dark.text, fontSize: 26, fontWeight: '800', lineHeight: 33, marginTop: spacing.sm },

  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  chip: { borderRadius: 10, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  chipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },

  boxRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  infoBox: {
    flex: 1,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  boxLabel: { color: dark.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  boxValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  boxValue: { color: dark.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  boxValueMuted: { color: dark.textMuted, fontSize: 13 },

  sectionLabel: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionMeta: { color: dark.accentGreen, fontSize: 11, fontWeight: '600', marginBottom: spacing.sm },

  notesCard: {
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  notesText: { color: dark.text, fontSize: 13, lineHeight: 20 },
  notesEmpty: { color: dark.textMuted, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },

  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: dark.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxDone: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
  subtaskText: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600' },
  subtaskTextDone: { color: dark.textMuted, textDecorationLine: 'line-through' },

  addSubtaskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addSubtaskInput: {
    flex: 1,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: dark.text,
    fontSize: 13,
  },
  addSubtaskButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(23,230,149,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(23,230,149,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(74,125,247,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  linkBody: { flex: 1, marginRight: spacing.sm },
  linkTitle: { color: dark.text, fontSize: 13, fontWeight: '600' },
  linkUrl: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});

export default TaskDetailScreen;
