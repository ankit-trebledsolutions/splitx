import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import NewTaskSheet from '../components/NewTaskSheet';
import TaskSavedModal from '../components/TaskSavedModal';
import ChatTab from './group/ChatTab';
import ExpensesTab from './group/ExpensesTab';
import TasksTab from './group/TasksTab';
import RemindersTab from './group/RemindersTab';
import { useAuth } from '../context/AuthContext';
import { fetchGroup, fetchExpenses } from '../api/groups.api';
import { fetchMessages, sendMessage } from '../api/chat.api';
import { fetchTasks, createTask, updateTask } from '../api/tasks.api';
import { fetchReminders, createReminder, updateReminder } from '../api/reminders.api';
import { detectTask } from '../utils/taskDetect';
import { dark, radius, spacing } from '../theme';

const TABS = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-outline' },
  { key: 'expenses', label: 'Expenses', icon: 'cash-outline' },
  { key: 'tasks', label: 'Tasks', icon: 'checkbox-outline' },
  { key: 'reminders', label: 'Reminders', icon: 'alarm-outline' },
];

const MESSAGE_POLL_MS = 15000;

// One hour before the due time, or an hour from now if the task has no due date.
const defaultRemindAt = (dueAt) => {
  const base = dueAt ? new Date(dueAt) : new Date(Date.now() + 2 * 60 * 60 * 1000);
  base.setHours(base.getHours() - 1);
  return (base.getTime() < Date.now() ? new Date(Date.now() + 60 * 60 * 1000) : base).toISOString();
};

const GroupChatScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id;

  const [tab, setTab] = useState('chat');
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [sheetSeed, setSheetSeed] = useState(null);
  const [savedTask, setSavedTask] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Suggestions the user already acted on or dismissed, so they stay gone.
  const handledSuggestions = useRef(new Set());

  const loadAll = useCallback(async () => {
    try {
      const [groupData, messageData, expenseData, taskData, reminderData] = await Promise.all([
        fetchGroup(groupId),
        fetchMessages(groupId),
        fetchExpenses(groupId),
        fetchTasks(groupId),
        fetchReminders(groupId),
      ]);
      setGroup(groupData);
      setMessages(messageData);
      setExpenses(expenseData);
      setTasks(taskData);
      setReminders(reminderData);
    } catch (err) {
      Alert.alert('Could not load group', err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  // Light polling stands in for websockets so other members' activity appears.
  useEffect(() => {
    if (tab !== 'chat') return undefined;
    const timer = setInterval(async () => {
      try {
        setMessages(await fetchMessages(groupId));
      } catch {
        // Ignore transient polling failures; the next tick retries.
      }
    }, MESSAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [tab, groupId]);

  // Offer a task whenever the newest chat message reads like a to-do.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.type === 'text');
    if (!last || handledSuggestions.current.has(last._id)) {
      setSuggestion(null);
      return;
    }
    const detected = detectTask(last.text);
    setSuggestion(
      detected
        ? {
            messageId: last._id,
            title: detected.title,
            text: last.text,
            from: last.sender,
            at: last.createdAt,
            source: {
              message: last._id,
              user: last.sender?._id,
              text: last.text,
              at: last.createdAt,
            },
          }
        : null
    );
  }, [messages]);

  const dismissSuggestion = () => {
    if (suggestion) handledSuggestions.current.add(suggestion.messageId);
    setSuggestion(null);
  };

  const handleSend = async (text) => {
    try {
      const message = await sendMessage(groupId, text);
      setMessages((prev) => [...prev, message]);
    } catch (err) {
      Alert.alert('Could not send', err.message);
    }
  };

  const openTaskSheet = (seed = null) => {
    setSheetSeed(seed);
    setTaskSheetOpen(true);
  };

  const handleCreateTask = async (payload) => {
    try {
      const task = await createTask(groupId, payload);
      setTaskSheetOpen(false);
      if (suggestion) handledSuggestions.current.add(suggestion.messageId);
      setSuggestion(null);
      setTasks((prev) => [task, ...prev]);
      setMessages(await fetchMessages(groupId));
      setSavedTask(task);
    } catch (err) {
      Alert.alert('Could not save task', err.message);
    }
  };

  const addReminder = async ({ title, subtitle, remindAt, taskId, icon }) => {
    try {
      const reminder = await createReminder(groupId, {
        title,
        subtitle,
        remindAt,
        scope: 'group',
        icon: icon ?? 'alarm-outline',
        ...(taskId ? { task: taskId } : {}),
      });
      setReminders((prev) => [...prev, reminder]);
      setMessages(await fetchMessages(groupId));
      return reminder;
    } catch (err) {
      Alert.alert('Could not set reminder', err.message);
      return null;
    }
  };

  const handleRemindFromSuggestion = async () => {
    if (!suggestion) return;
    handledSuggestions.current.add(suggestion.messageId);
    const created = await addReminder({
      title: suggestion.title,
      subtitle: `Mentioned by ${suggestion.from?.name ?? 'a member'}`,
      remindAt: defaultRemindAt(null),
    });
    setSuggestion(null);
    if (created) setTab('reminders');
  };

  const handleSetReminderForTask = async () => {
    const task = savedTask;
    setSavedTask(null);
    if (!task) return;
    const created = await addReminder({
      title: task.title,
      subtitle: 'Task reminder',
      remindAt: defaultRemindAt(task.dueAt),
      taskId: task._id,
    });
    if (created) setTab('reminders');
  };

  const handleToggleTask = async (task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t._id === task._id ? { ...t, status: nextStatus } : t))
    );
    try {
      const updated = await updateTask(task._id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t))); // roll back
      Alert.alert('Could not update task', err.message);
    }
  };

  const handleToggleReminder = async (reminder) => {
    const enabled = !reminder.enabled;
    setReminders((prev) =>
      prev.map((r) => (r._id === reminder._id ? { ...r, enabled } : r))
    );
    try {
      const updated = await updateReminder(reminder._id, { enabled });
      setReminders((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
    } catch (err) {
      setReminders((prev) => prev.map((r) => (r._id === reminder._id ? reminder : r)));
      Alert.alert('Could not update reminder', err.message);
    }
  };

  const openAddExpense = () => {
    setActionsOpen(false);
    navigation.navigate('AddExpense', { groupId, members: group?.members ?? [] });
  };

  const openExpense = (expense) => {
    navigation.navigate('ExpenseDetail', { expenseId: expense._id, groupName: group?.name });
  };

  const memberCount = group?.members?.length ?? 0;

  const headerSubtitle = useMemo(() => {
    const parts = [`${memberCount} member${memberCount === 1 ? '' : 's'}`];
    if (group?.totalDays) parts.push(`${group.totalDays} days`);
    return parts.join(' · ');
  }, [memberCount, group?.totalDays]);

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={dark.text} />
        </TouchableOpacity>

        <Avatar name={group?.name ?? '…'} size={36} style={styles.headerAvatar} />

        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group?.name ?? 'Group'}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>

        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <Ionicons name="call-outline" size={17} color={dark.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <Ionicons name="videocam-outline" size={17} color={dark.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIcon}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('GroupInvite', { group })}
          disabled={!group}
        >
          <Ionicons name="person-add-outline" size={16} color={dark.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(item.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={item.icon}
                size={14}
                color={active ? dark.accentGreen : dark.textMuted}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'chat' && (
        <ChatTab
          messages={messages}
          loading={loading}
          currentUserId={currentUserId}
          suggestion={suggestion}
          onDismissSuggestion={dismissSuggestion}
          onAddSuggestionToTasks={() => openTaskSheet(suggestion)}
          onRemindSuggestion={handleRemindFromSuggestion}
          onSend={handleSend}
          onOpenExpense={openExpense}
          onOpenTask={() => setTab('tasks')}
          onOpenReminders={() => setTab('reminders')}
        />
      )}

      {tab === 'expenses' && (
        <ExpensesTab
          expenses={expenses}
          loading={loading}
          currentUserId={currentUserId}
          onOpenExpense={openExpense}
        />
      )}

      {tab === 'tasks' && (
        <TasksTab tasks={tasks} loading={loading} onToggle={handleToggleTask} onOpenTask={() => {}} />
      )}

      {tab === 'reminders' && (
        <RemindersTab reminders={reminders} loading={loading} onToggle={handleToggleReminder} />
      )}

      {tab !== 'chat' || !suggestion ? (
        <View style={styles.fabWrap}>
          {actionsOpen && (
            <View style={styles.actionMenu}>
              <TouchableOpacity style={styles.actionItem} onPress={openAddExpense} activeOpacity={0.8}>
                <Ionicons name="cash-outline" size={16} color={dark.accentGreen} />
                <Text style={styles.actionText}>Add Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setActionsOpen(false);
                  openTaskSheet(null);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="checkbox-outline" size={16} color={dark.accentBlue} />
                <Text style={styles.actionText}>New Task</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.9}
            onPress={() => setActionsOpen((open) => !open)}
          >
            <LinearGradient
              colors={[dark.accentBlue, dark.accentGreen]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabInner}
            >
              <Ionicons name={actionsOpen ? 'close' : 'add'} size={26} color="#04121C" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      <NewTaskSheet
        visible={taskSheetOpen}
        members={group?.members ?? []}
        suggestion={sheetSeed}
        onClose={() => setTaskSheetOpen(false)}
        onSubmit={handleCreateTask}
      />

      <TaskSavedModal
        visible={!!savedTask}
        task={savedTask}
        onSetReminder={handleSetReminderForTask}
        onDismiss={() => setSavedTask(null)}
      />
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: { marginHorizontal: spacing.sm },
  headerText: { flex: 1, marginRight: spacing.sm },
  headerTitle: { color: dark.text, fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: dark.accentGreen },
  tabText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: dark.accentGreen },

  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, alignItems: 'flex-end' },
  actionMenu: {
    backgroundColor: '#0F1A20',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    padding: spacing.xs,
    marginBottom: spacing.sm,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  actionText: { color: dark.text, fontSize: 13, fontWeight: '600' },
  fab: { borderRadius: 28 },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GroupChatScreen;
