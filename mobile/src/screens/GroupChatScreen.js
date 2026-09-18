import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import CallBanner from '../components/CallBanner';
import NewTaskSheet from '../components/NewTaskSheet';
import TaskSavedModal from '../components/TaskSavedModal';
import NewItineraryDaySheet from '../components/NewItineraryDaySheet';
import NewReminderSheet from '../components/NewReminderSheet';
import NewAttractionSheet from '../components/NewAttractionSheet';
import NewStaySheet from '../components/NewStaySheet';
import ChatTab, { COMPOSER_HEIGHT, composerBottomPadding } from './group/ChatTab';
import ExpensesTab from './group/ExpensesTab';
import TasksTab from './group/TasksTab';
import RemindersTab from './group/RemindersTab';
import ItineraryTab from './group/ItineraryTab';
import GalleryTab from './group/GalleryTab';
import AttractionsTab from './group/AttractionsTab';
import StaysTab from './group/StaysTab';
import { useAuth } from '../context/AuthContext';
import { useActiveCall } from '../context/ActiveCallProvider';
import { useSocket } from '../context/SocketProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboardVisible from '../hooks/useKeyboardVisible';
import { fetchGroup, fetchExpenses } from '../api/groups.api';
import { fetchMessages, sendMessage } from '../api/chat.api';
import { fetchTasks, createTask, updateTask } from '../api/tasks.api';
import { fetchReminders, createReminder, updateReminder } from '../api/reminders.api';
import { fetchItinerary, createItineraryDay } from '../api/itinerary.api';
import { fetchPhotos, deletePhoto } from '../api/gallery.api';
import {
  fetchAttractions,
  createAttraction,
  toggleSaveAttraction,
  deleteAttraction,
} from '../api/attractions.api';
import { fetchStays, createStay, updateStay, deleteStay } from '../api/stays.api';
import { detectTask } from '../utils/taskDetect';
import { dark, radius, spacing } from '../theme';
import AppAlert from '../components/AppAlert';

const TABS = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-outline' },
  { key: 'expenses', label: 'Expenses', icon: 'cash-outline' },
  { key: 'tasks', label: 'Tasks', icon: 'checkbox-outline' },
  { key: 'reminders', label: 'Reminders', icon: 'alarm-outline' },
  { key: 'itinerary', label: 'Itinerary', icon: 'map-outline' },
  { key: 'gallery', label: 'Gallery', icon: 'images-outline' },
  { key: 'attractions', label: 'Attractions', icon: 'compass-outline' },
  { key: 'stays', label: 'Stays', icon: 'bed-outline' },
];

// Which stay status a tap on the chip moves to next.
const NEXT_STAY_STATUS = { pending: 'confirmed', confirmed: 'cancelled', cancelled: 'pending' };

// Announce typing at most this often; hide a member's indicator after silence.
const TYPING_THROTTLE_MS = 3000;
const TYPING_HIDE_MS = 5000;

// One hour before the due time, or an hour from now if the task has no due date.
const defaultRemindAt = (dueAt) => {
  const base = dueAt ? new Date(dueAt) : new Date(Date.now() + 2 * 60 * 60 * 1000);
  base.setHours(base.getHours() - 1);
  return (base.getTime() < Date.now() ? new Date(Date.now() + 60 * 60 * 1000) : base).toISOString();
};

// Messages per request: the first page on open, and each older page on scroll-up.
const MESSAGE_PAGE = 50;

const GroupChatScreen = ({ route, navigation }) => {
  const { groupId, initialTab } = route.params;
  const { user } = useAuth();
  const currentUserId = user?._id;
  const { join } = useActiveCall();
  const { socket, connected } = useSocket();

  const [tab, setTab] = useState(initialTab ?? 'chat');
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [itineraryDays, setItineraryDays] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [attractions, setAttractions] = useState([]);
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  // The chat has its own flag so it appears as soon as messages land, without
  // waiting for the other tabs' data.
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasOlder = useRef(true);
  const fetchingOlder = useRef(false);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = useState(false);
  const [attractionSheetOpen, setAttractionSheetOpen] = useState(false);
  const [staySheetOpen, setStaySheetOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [sheetSeed, setSheetSeed] = useState(null);
  const [savedTask, setSavedTask] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Suggestions the user already acted on or dismissed, so they stay gone.
  const handledSuggestions = useRef(new Set());

  // Other members currently typing (userId -> name); timers auto-hide them.
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimers = useRef({});
  const lastTypingSent = useRef(0);
  // Latest message time, for reconnect catch-up.
  const latestMessageAt = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      const [
        groupData,
        messageData,
        expenseData,
        taskData,
        reminderData,
        itineraryData,
        photoData,
        attractionData,
        stayData,
      ] = await Promise.all([
        fetchGroup(groupId),
        fetchMessages(groupId, { limit: MESSAGE_PAGE }).then((page) => {
          hasOlder.current = page.length >= MESSAGE_PAGE;
          setMessages(page);
          setMessagesLoading(false);
          return page;
        }),
        fetchExpenses(groupId),
        fetchTasks(groupId),
        fetchReminders(groupId),
        fetchItinerary(groupId),
        fetchPhotos(groupId),
        fetchAttractions(groupId),
        fetchStays(groupId),
      ]);
      setGroup(groupData);
      setExpenses(expenseData);
      setTasks(taskData);
      setReminders(reminderData);
      setItineraryDays(itineraryData);
      setPhotos(photoData);
      setAttractions(attractionData);
      setStays(stayData);
    } catch (err) {
      AppAlert.alert('Could not load group', err.message);
    } finally {
      setLoading(false);
      setMessagesLoading(false);
    }
  }, [groupId]);

  // Scrolling up to the oldest loaded message pulls in the page before it.
  const loadOlderMessages = useCallback(async () => {
    if (fetchingOlder.current || !hasOlder.current || !messages.length) return;
    fetchingOlder.current = true;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(groupId, {
        before: messages[0].createdAt,
        limit: MESSAGE_PAGE,
      });
      hasOlder.current = older.length >= MESSAGE_PAGE;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m._id));
        return [...older.filter((m) => !known.has(m._id)), ...prev];
      });
    } catch {
      // Scrolling up again retries.
    } finally {
      fetchingOlder.current = false;
      setLoadingOlder(false);
    }
  }, [groupId, messages]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    latestMessageAt.current = messages.length ? messages[messages.length - 1].createdAt : null;
  }, [messages]);

  // Live updates over the socket replace polling: new messages and activity
  // cards are pushed the instant they're saved, typing is relayed, and a
  // reconnect fetches only what was missed while the connection was down.
  useEffect(() => {
    if (!socket || !connected) return undefined;
    socket.emit('group:open', { groupId });

    const appendUnique = (message) =>
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));

    const onMessage = ({ message } = {}) => {
      if (!message) return;
      const g = message.group?._id ?? message.group;
      if (String(g) !== String(groupId)) return;
      appendUnique(message);
    };

    const hideTyping = (userId) => {
      delete typingTimers.current[userId];
      setTypingUsers((prev) => {
        if (!prev[userId]) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };

    const onTyping = ({ groupId: g, userId, name, typing } = {}) => {
      if (String(g) !== String(groupId) || userId === currentUserId) return;
      clearTimeout(typingTimers.current[userId]);
      if (!typing) return hideTyping(userId);
      setTypingUsers((prev) => (prev[userId] ? prev : { ...prev, [userId]: name }));
      typingTimers.current[userId] = setTimeout(() => hideTyping(userId), TYPING_HIDE_MS);
    };

    // Catch up on anything sent while we were disconnected.
    (async () => {
      if (!latestMessageAt.current) return;
      try {
        const missed = await fetchMessages(groupId, { after: latestMessageAt.current });
        missed.forEach(appendUnique);
      } catch {
        // The next reconnect (or reopening the screen) retries.
      }
    })();

    // Removed by the admin (or left on another device) while the chat is open.
    const onMemberLeft = (event) => {
      if (event.groupId !== groupId || event.userId !== currentUserId) return;
      // Not focused means Group Info is on top and handles it (e.g. we just left).
      if (!navigation.isFocused()) return;
      AppAlert.alert('You are no longer in this group');
      navigation.navigate('MainTabs');
    };

    socket.on('message:new', onMessage);
    socket.on('typing', onTyping);
    socket.on('group:member-left', onMemberLeft);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('typing', onTyping);
      socket.off('group:member-left', onMemberLeft);
    };
  }, [socket, connected, groupId, currentUserId, navigation]);

  // Drop any pending typing timers when leaving the screen.
  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

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
      // The server also pushes this back over the socket; keep whichever lands first.
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
    } catch (err) {
      AppAlert.alert('Could not send', err.message);
    }
  };

  // Throttled: a burst of keystrokes becomes one event per TYPING_THROTTLE_MS.
  const handleTyping = (isTyping) => {
    if (!socket || !connected) return;
    const now = Date.now();
    if (isTyping && now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
    lastTypingSent.current = isTyping ? now : 0;
    socket.emit('typing', { groupId, typing: isTyping });
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
      if (!connected) setMessages(await fetchMessages(groupId));
      setSavedTask(task);
    } catch (err) {
      AppAlert.alert('Could not save task', err.message);
    }
  };

  const addReminder = async ({ title, subtitle, remindAt, taskId, icon, scope, repeatWeekly }) => {
    try {
      const reminder = await createReminder(groupId, {
        title,
        subtitle,
        remindAt,
        scope: scope ?? 'group',
        ...(repeatWeekly !== undefined ? { repeatWeekly } : {}),
        icon: icon ?? 'alarm-outline',
        ...(taskId ? { task: taskId } : {}),
      });
      setReminders((prev) => [...prev, reminder]);
      if (!connected) setMessages(await fetchMessages(groupId));
      return reminder;
    } catch (err) {
      AppAlert.alert('Could not set reminder', err.message);
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
      AppAlert.alert('Could not update task', err.message);
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
      AppAlert.alert('Could not update reminder', err.message);
    }
  };

  const refreshMessages = async () => {
    try {
      if (!connected) setMessages(await fetchMessages(groupId));
    } catch {
      // A stale chat feed is fine; the next poll or focus reloads it.
    }
  };

  const handleCreateDay = async (payload) => {
    try {
      const day = await createItineraryDay(groupId, payload);
      setDaySheetOpen(false);
      setItineraryDays((prev) =>
        [...prev, day].sort((a, b) => a.dayNumber - b.dayNumber)
      );
      await refreshMessages();
    } catch (err) {
      AppAlert.alert('Could not add day', err.message);
    }
  };

  const handleCreateReminder = async (payload) => {
    const created = await addReminder(payload);
    if (created) {
      setReminderSheetOpen(false);
      setTab('reminders');
    }
  };

  const openEditDay = (day) => {
    navigation.navigate('EditItineraryDay', { day, groupName: group?.name });
  };

  const openUploadPhotos = () => {
    navigation.navigate('UploadPhotos', { groupId, groupName: group?.name });
  };

  const openTaskDetail = (task) => {
    if (task?._id) navigation.navigate('TaskDetail', { taskId: task._id });
  };

  const handleDeletePhoto = (photo) => {
    AppAlert.alert('Delete photo', 'Remove this photo from the gallery?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo._id);
            setPhotos((prev) => prev.filter((p) => p._id !== photo._id));
          } catch (err) {
            AppAlert.alert('Could not delete photo', err.message);
          }
        },
      },
    ]);
  };

  const handleAddAttraction = async (payload) => {
    try {
      const attraction = await createAttraction(groupId, payload);
      setAttractionSheetOpen(false);
      setAttractions((prev) => [...prev, attraction]);
      await refreshMessages();
    } catch (err) {
      AppAlert.alert('Could not add attraction', err.message);
    }
  };

  const handleToggleSaveAttraction = async (attraction) => {
    const saved = attraction.savedBy?.some((id) => (id?._id ?? id) === currentUserId);
    const optimistic = {
      ...attraction,
      savedBy: saved
        ? attraction.savedBy.filter((id) => (id?._id ?? id) !== currentUserId)
        : [...(attraction.savedBy ?? []), currentUserId],
    };
    setAttractions((prev) => prev.map((a) => (a._id === attraction._id ? optimistic : a)));
    try {
      const updated = await toggleSaveAttraction(attraction._id);
      setAttractions((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
    } catch (err) {
      setAttractions((prev) => prev.map((a) => (a._id === attraction._id ? attraction : a)));
      AppAlert.alert('Could not update bookmark', err.message);
    }
  };

  const handleDeleteAttraction = (attraction) => {
    AppAlert.alert('Delete attraction', `Remove ${attraction.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAttraction(attraction._id);
            setAttractions((prev) => prev.filter((a) => a._id !== attraction._id));
          } catch (err) {
            AppAlert.alert('Could not delete attraction', err.message);
          }
        },
      },
    ]);
  };

  const handleAddStay = async (payload) => {
    try {
      const stay = await createStay(groupId, payload);
      setStaySheetOpen(false);
      setStays((prev) =>
        [...prev, stay].sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn))
      );
      await refreshMessages();
    } catch (err) {
      AppAlert.alert('Could not add stay', err.message);
    }
  };

  const handleToggleStayStatus = async (stay) => {
    const status = NEXT_STAY_STATUS[stay.status] ?? 'confirmed';
    try {
      const updated = await updateStay(stay._id, { status });
      setStays((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
      await refreshMessages();
    } catch (err) {
      AppAlert.alert('Could not update stay', err.message);
    }
  };

  const handleDeleteStay = (stay) => {
    AppAlert.alert('Delete stay', `Remove ${stay.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStay(stay._id);
            setStays((prev) => prev.filter((s) => s._id !== stay._id));
          } catch (err) {
            AppAlert.alert('Could not delete stay', err.message);
          }
        },
      },
    ]);
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

        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('GroupDetail', { groupId })}
        >
          <Avatar name={group?.name ?? '…'} size={36} style={styles.headerAvatar} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group?.name ?? 'Group'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIcon}
          activeOpacity={0.7}
          onPress={() => {
            join(groupId, { audioOnly: true });
            navigation.navigate('Call');
          }}
        >
          <Ionicons name="call-outline" size={17} color={dark.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIcon}
          activeOpacity={0.7}
          onPress={() => {
            join(groupId, { audioOnly: false });
            navigation.navigate('Call');
          }}
        >
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
        <TouchableOpacity
          style={styles.headerIcon}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('GroupDetail', { groupId })}
        >
          <Ionicons name="ellipsis-vertical" size={15} color={dark.text} />
        </TouchableOpacity>
      </View>

      <CallBanner groupId={groupId} navigation={navigation} />

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
        </ScrollView>
      </View>

      {tab === 'chat' && (
        <ChatTab
          messages={messages}
          loading={messagesLoading}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlderMessages}
          onOpenCamera={openUploadPhotos}
          fabVisible={!suggestion}
          currentUserId={currentUserId}
          suggestion={suggestion}
          onDismissSuggestion={dismissSuggestion}
          onAddSuggestionToTasks={() => openTaskSheet(suggestion)}
          onRemindSuggestion={handleRemindFromSuggestion}
          onSend={handleSend}
          onTyping={handleTyping}
          typingUsers={Object.values(typingUsers)}
          onOpenExpense={openExpense}
          onOpenTask={(task) => (task?._id ? openTaskDetail(task) : setTab('tasks'))}
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
        <TasksTab tasks={tasks} loading={loading} onToggle={handleToggleTask} onOpenTask={openTaskDetail} />
      )}

      {tab === 'reminders' && (
        <RemindersTab reminders={reminders} loading={loading} onToggle={handleToggleReminder} />
      )}

      {tab === 'itinerary' && (
        <ItineraryTab
          days={itineraryDays}
          loading={loading}
          onAddDay={() => setDaySheetOpen(true)}
          onEditDay={openEditDay}
        />
      )}

      {tab === 'gallery' && (
        <GalleryTab
          photos={photos}
          loading={loading}
          currentUserId={currentUserId}
          onAddPhoto={openUploadPhotos}
          onDeletePhoto={handleDeletePhoto}
        />
      )}

      {tab === 'attractions' && (
        <AttractionsTab
          attractions={attractions}
          loading={loading}
          currentUserId={currentUserId}
          onToggleSave={handleToggleSaveAttraction}
          onDelete={handleDeleteAttraction}
        />
      )}

      {tab === 'stays' && (
        <StaysTab
          stays={stays}
          loading={loading}
          organiserId={group?.admin ?? group?.createdBy?._id ?? group?.createdBy}
          onToggleStatus={handleToggleStayStatus}
          onDelete={handleDeleteStay}
        />
      )}

      {/* In the chat the button floats above the composer so it never covers
          Send, and steps aside entirely while the keyboard is up. */}
      {(tab !== 'chat' || !suggestion) && !(tab === 'chat' && keyboardVisible) ? (
        <View
          style={[
            styles.fabWrap,
            tab === 'chat' && { bottom: composerBottomPadding(insets) + COMPOSER_HEIGHT + 14 },
          ]}
        >
          {actionsOpen && (
            <View style={styles.actionMenu}>
              {[
                tab === 'itinerary' && {
                  key: 'day',
                  icon: 'map-outline',
                  tint: '#2DD4BF',
                  label: 'Add Day',
                  onPress: () => setDaySheetOpen(true),
                },
                tab === 'gallery' && {
                  key: 'photo',
                  icon: 'images-outline',
                  tint: '#2DD4BF',
                  label: 'Upload Photos',
                  onPress: openUploadPhotos,
                },
                tab === 'attractions' && {
                  key: 'attraction',
                  icon: 'compass-outline',
                  tint: '#2DD4BF',
                  label: 'Add Attraction',
                  onPress: () => setAttractionSheetOpen(true),
                },
                tab === 'stays' && {
                  key: 'stay',
                  icon: 'bed-outline',
                  tint: '#2DD4BF',
                  label: 'Add Stay',
                  onPress: () => setStaySheetOpen(true),
                },
                {
                  key: 'task',
                  icon: 'checkmark',
                  tint: '#22C55E',
                  label: 'New Task',
                  onPress: () => openTaskSheet(null),
                },
                {
                  key: 'reminder',
                  icon: 'notifications-outline',
                  tint: '#2DD4BF',
                  label: 'New Reminder',
                  onPress: () => setReminderSheetOpen(true),
                },
                {
                  key: 'expense',
                  icon: 'cash-outline',
                  tint: '#22C55E',
                  label: 'Add Expense',
                  onPress: openAddExpense,
                },
                {
                  key: 'friends',
                  icon: 'person-add-outline',
                  tint: '#2DD4BF',
                  label: 'Add Friends',
                  onPress: () => navigation.navigate('GroupInvite', { group }),
                },
              ]
                .filter(Boolean)
                .map((item, index) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.actionItem, index > 0 && styles.actionItemBorder]}
                    onPress={() => {
                      setActionsOpen(false);
                      item.onPress();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: `${item.tint}26` }]}>
                      <Ionicons name={item.icon} size={15} color={item.tint} />
                    </View>
                    <Text style={styles.actionText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.fab}
            activeOpacity={0.9}
            onPress={() => setActionsOpen((open) => !open)}
          >
            <LinearGradient
              colors={dark.gradient}
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

      <NewItineraryDaySheet
        visible={daySheetOpen}
        nextDayNumber={(itineraryDays[itineraryDays.length - 1]?.dayNumber ?? 0) + 1}
        onClose={() => setDaySheetOpen(false)}
        onSubmit={handleCreateDay}
      />

      <NewReminderSheet
        visible={reminderSheetOpen}
        onClose={() => setReminderSheetOpen(false)}
        onSubmit={handleCreateReminder}
      />

      <NewAttractionSheet
        visible={attractionSheetOpen}
        onClose={() => setAttractionSheetOpen(false)}
        onSubmit={handleAddAttraction}
      />

      <NewStaySheet
        visible={staySheetOpen}
        onClose={() => setStaySheetOpen(false)}
        onSubmit={handleAddStay}
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
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { marginHorizontal: spacing.sm },
  headerText: { flex: 1, marginRight: spacing.sm },
  headerTitle: { color: dark.text, fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  tabBar: {
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: dark.accentGreen },
  tabText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: dark.accentGreen },

  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, alignItems: 'flex-end' },
  // Light popup card, per the "+" menu mockup.
  actionMenu: {
    backgroundColor: '#F7FAF9',
    borderRadius: radius.lg + 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    minWidth: 190,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
  },
  actionItemBorder: { borderTopWidth: 1, borderTopColor: 'rgba(11,17,22,0.06)' },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#0B1116', fontSize: 14, fontWeight: '600' },
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
