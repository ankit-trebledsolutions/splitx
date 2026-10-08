import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DarkScreen, { TOP_ONLY } from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import CallBanner from '../components/CallBanner';
import AiItineraryBanner, { aiRunningText } from '../components/AiItineraryBanner';
import AiWorkingView from '../components/AiWorkingView';
import NewTaskSheet from '../components/NewTaskSheet';
import TaskSavedModal from '../components/TaskSavedModal';
import NewItineraryDaySheet from '../components/NewItineraryDaySheet';
import ReminderSheet from '../components/ReminderSheet';
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
import useAiItinerary from '../hooks/useAiItinerary';
import useReminderActions from '../hooks/useReminderActions';
import { fetchGroup, fetchExpenses } from '../api/groups.api';
import { fetchMessages, sendMessage, sendAttachment, deleteMessage } from '../api/chat.api';
import { fetchTasks, createTask, updateTask } from '../api/tasks.api';
import { fetchReminders } from '../api/reminders.api';
import { fetchItinerary, createItineraryDay } from '../api/itinerary.api';
import { fetchPhotos, deletePhotos } from '../api/gallery.api';
import {
  fetchAttractions,
  createAttraction,
  toggleSaveAttraction,
  deleteAttraction,
} from '../api/attractions.api';
import { fetchStays, createStay, updateStay, deleteStay } from '../api/stays.api';
import { detectTask } from '../utils/taskDetect';
import { AI_ALERTS, replaceConfirmMessage } from '../constants/aiItineraryOptions';
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

// Tabs that only a trip has. Every other kind of group (home, couple, event,
// other) never shows them. The server refuses the same writes with TRIP_ONLY.
const TRIP_ONLY_TABS = new Set(['itinerary', 'attractions']);
const TABS_WITHOUT_TRIP = TABS.filter((item) => !TRIP_ONLY_TABS.has(item.key));

// Which stay status a tap on the chip moves to next.
const NEXT_STAY_STATUS = { pending: 'confirmed', confirmed: 'cancelled', cancelled: 'pending' };

// Announce typing at most this often; hide a member's indicator after silence.
const TYPING_THROTTLE_MS = 3000;
const TYPING_HIDE_MS = 5000;

// One hour before the due time, or an hour from now if the task has no due
// date. It is only where the reminder sheet starts: the person confirms or
// changes the time there before anything is set.
const defaultRemindAt = (dueAt) => {
  const base = dueAt ? new Date(dueAt) : new Date(Date.now() + 2 * 60 * 60 * 1000);
  base.setHours(base.getHours() - 1);
  return (base.getTime() < Date.now() ? new Date(Date.now() + 60 * 60 * 1000) : base).toISOString();
};

// Messages per request: the first page on open, and each older page on scroll-up.
const MESSAGE_PAGE = 50;

// Per-group flag (key + "." + groupId): the member closed the "Let AI plan
// this trip" nudge, so it stays closed.
const AI_NUDGE_KEY = 'splix.aiNudgeDismissed';

// Day numbers are calendar positions, so deleting a day leaves a hole and the
// next "Add Day" fills the lowest one rather than extending the end.
const lowestFreeDayNumber = (days) => {
  const taken = new Set(days.map((d) => d.dayNumber));
  let next = 1;
  while (taken.has(next)) next += 1;
  return next;
};

// The calendar day "Day N" falls on, as a timestamp: counted from the trip's
// start date, else from the nearest earlier day that has a date, else today.
// Pinned to local noon so the ISO string can't land on the day before or
// after in another time zone (the same rule DateField follows).
const dateForDayNumber = (dayNumber, startDate, days) => {
  const noonAfter = (value, plusDays) => {
    const from = new Date(value);
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + plusDays, 12).getTime();
  };
  if (startDate) return noonAfter(startDate, dayNumber - 1);
  const earlier = days
    .filter((d) => d.date && d.dayNumber < dayNumber)
    .sort((a, b) => b.dayNumber - a.dayNumber)[0];
  if (earlier) return noonAfter(earlier.date, dayNumber - earlier.dayNumber);
  return noonAfter(Date.now(), 0);
};

const GroupChatScreen = ({ route, navigation }) => {
  // groupType is only a hint from the list the user came from, so the right
  // tabs are there on the first frame; the loaded group always has the last word.
  const { groupId, initialTab, aiJob, groupType: groupTypeHint } = route.params;
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
  // My attachments still uploading. Kept apart from `messages` so their
  // phone-clock timestamps never feed paging or the reconnect catch-up.
  const [pendingUploads, setPendingUploads] = useState([]);
  const feed = useMemo(
    () => (pendingUploads.length ? [...messages, ...pendingUploads] : messages),
    [messages, pendingUploads]
  );
  const hasOlder = useRef(true);
  const fetchingOlder = useRef(false);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const [attractionSheetOpen, setAttractionSheetOpen] = useState(false);
  const [staySheetOpen, setStaySheetOpen] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [sheetSeed, setSheetSeed] = useState(null);
  const [savedTask, setSavedTask] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  // A stay, attraction or gallery item a chat card asked to show: { tab, id }.
  // The tab scrolls to it or opens it, then clears this.
  const [focus, setFocus] = useState(null);
  const clearFocus = useCallback(() => setFocus(null), []);
  // The card tap still fetching its item ({ tab }); leaving that tab, or
  // tapping another card, cancels it so it can't open anything later.
  const pendingCard = useRef(null);
  // Bumped once an AI plan has landed, to remount the Itinerary tab: it picks
  // the day to open when it mounts, and after a replan that day is gone.
  const [itineraryKey, setItineraryKey] = useState(0);
  // Hidden until storage answers, so a nudge closed earlier never flashes back.
  const [aiNudgeDismissed, setAiNudgeDismissed] = useState(true);

  // Suggestions the user already acted on or dismissed, so they stay gone.
  const handledSuggestions = useRef(new Set());

  // Other members currently typing (userId -> name); timers auto-hide them.
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimers = useRef({});
  const lastTypingSent = useRef(0);
  // Latest message time, for reconnect catch-up.
  const latestMessageAt = useRef(null);
  // An AI plan can finish after this screen has closed; its late refetch must
  // not write into a screen that is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The itinerary is fetched by loadAll and, on the server's word, on its own.
  // Each fetch takes a number when it starts, and its answer is dropped once a
  // later fetch has answered, so a slow loadAll can't put an empty list back
  // over a plan that AI finished in the meantime.
  const itineraryFetch = useRef({ started: 0, shown: 0 });
  const showItinerary = useCallback((ticket, days) => {
    if (!mounted.current || ticket < itineraryFetch.current.shown) return;
    itineraryFetch.current.shown = ticket;
    setItineraryDays(days);
  }, []);

  const loadAll = useCallback(async () => {
    itineraryFetch.current.started += 1;
    const itineraryTicket = itineraryFetch.current.started;
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
      showItinerary(itineraryTicket, itineraryData);
      setPhotos(photoData);
      setAttractions(attractionData);
      setStays(stayData);
    } catch (err) {
      AppAlert.alert('Could not load group', err.message);
    } finally {
      setLoading(false);
      setMessagesLoading(false);
    }
  }, [groupId, showItinerary]);

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

  // After "delete for everyone", mine or someone else's: swap in the emptied
  // placeholder, and mark any reply that quotes the message the same way.
  const applyDeleted = useCallback((deleted) => {
    if (!deleted?._id) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m._id === deleted._id) return deleted;
        if (m.replyTo?._id === deleted._id) {
          return { ...m, replyTo: { ...m.replyTo, text: '', deletedAt: deleted.deletedAt } };
        }
        return m;
      })
    );
  }, []);

  // The other tabs' lists change under this screen too: a card arriving in the
  // chat says which one (see the socket effect). Only the latest fetch of each
  // list is shown, so two quick changes can't land in the wrong order.
  const listFetch = useRef({});
  const refreshList = useCallback(
    async (key, fetcher, setter) => {
      const ticket = (listFetch.current[key] ?? 0) + 1;
      listFetch.current[key] = ticket;
      try {
        const data = await fetcher(groupId);
        if (mounted.current && listFetch.current[key] === ticket) setter(data);
        return data;
      } catch {
        // The next focus reloads it.
        return null;
      }
    },
    [groupId]
  );

  // Photos sent in the chat are listed in the gallery too, so that tab is
  // refreshed whenever one goes out or comes in.
  const refreshPhotos = useCallback(
    () => refreshList('gallery', fetchPhotos, setPhotos),
    [refreshList]
  );

  // Reminders are set, moved and deleted by other members too; the server says
  // when this list is out of date.
  const refreshReminders = useCallback(async () => {
    try {
      setReminders(await fetchReminders(groupId));
    } catch {
      // The next focus reloads it.
    }
  }, [groupId]);

  // Which list a chat card is about.
  const refreshForCard = useCallback(
    (type) => {
      if (type === 'image' || type === 'gallery') refreshPhotos();
      else if (type === 'task' || type === 'task_done') refreshList('tasks', fetchTasks, setTasks);
      else if (type === 'expense') refreshList('expenses', fetchExpenses, setExpenses);
      else if (type === 'stay') refreshList('stays', fetchStays, setStays);
      else if (type === 'attraction') refreshList('attractions', fetchAttractions, setAttractions);
    },
    [refreshPhotos, refreshList]
  );

  // The itinerary changes under this screen: AI writes it in the background
  // and other members edit it, so the server says when to fetch it again.
  const refreshItinerary = useCallback(async () => {
    itineraryFetch.current.started += 1;
    const ticket = itineraryFetch.current.started;
    try {
      showItinerary(ticket, await fetchItinerary(groupId));
    } catch {
      // The next focus reloads it.
    }
  }, [groupId, showItinerary]);

  // The key is bumped strictly after the new days are in, so the remounted
  // tab opens on Day 1 of the new plan.
  const handleAiDone = useCallback(async () => {
    await refreshItinerary();
    if (mounted.current) setItineraryKey((key) => key + 1);
  }, [refreshItinerary]);

  // Declared above the focus effect, which lists its refresh as a dependency.
  const ai = useAiItinerary({
    groupId,
    socket,
    connected,
    currentUserId,
    seedJob: aiJob,
    onItineraryChanged: refreshItinerary,
    onDone: handleAiDone,
  });
  const refreshAi = ai.refresh;

  useFocusEffect(
    useCallback(() => {
      loadAll();
      refreshAi();
    }, [loadAll, refreshAi])
  );

  // A notification tap lands here as `initialTab`, also when this group is
  // already open on another tab. Clearing the param once it is used is what
  // lets a later tap carrying the same tab register as a change.
  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    navigation.setParams({ initialTab: undefined });
  }, [initialTab, navigation]);

  useEffect(() => {
    let active = true;
    setAiNudgeDismissed(true);
    AsyncStorage.getItem(`${AI_NUDGE_KEY}.${groupId}`)
      .then((value) => {
        if (active) setAiNudgeDismissed(value === '1');
      })
      .catch(() => {
        if (active) setAiNudgeDismissed(false);
      });
    return () => {
      active = false;
    };
  }, [groupId]);

  // The feed as it stands, for socket handlers that need to know what a
  // removed card was about.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
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

    const inThisGroup = (message) =>
      String(message?.group?._id ?? message?.group) === String(groupId);

    // Something added anywhere arrives as a card: its tab is brought up to date too.
    const onMessage = ({ message } = {}) => {
      if (!message || !inThisGroup(message)) return;
      appendUnique(message);
      refreshForCard(message.type);
    };

    const onMessageDeleted = ({ message } = {}) => {
      if (inThisGroup(message)) applyDeleted(message);
    };

    // A card changed in place: a gallery card gained or lost a photo.
    const onMessageUpdated = ({ message } = {}) => {
      if (!message || !inThisGroup(message)) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
      refreshForCard(message.type);
    };

    // Cards whose subject is gone (deleted, or a completed task reopened).
    const onMessagesRemoved = ({ groupId: g, messageIds = [] } = {}) => {
      if (String(g) !== String(groupId) || !messageIds.length) return;
      const gone = new Set(messageIds);
      const types = new Set(
        messagesRef.current.filter((m) => gone.has(m._id)).map((m) => m.type)
      );
      setMessages((prev) => prev.filter((m) => !gone.has(m._id)));
      types.forEach(refreshForCard);
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

    // The admin deleted the whole group. Whatever screen of it is open (an
    // expense, a day being edited...) there is nothing left to show, so go
    // home. Group Info handles it itself, including for the admin who did it.
    const onGroupDeleted = (event) => {
      if (event.groupId !== groupId) return;
      const routes = navigation.getState()?.routes ?? [];
      if (routes[routes.length - 1]?.name === 'GroupDetail') return;
      AppAlert.alert('Group deleted', `"${event.name}" was deleted by its admin.`);
      navigation.navigate('MainTabs');
    };

    const onReminderChanged = (event) => {
      if (String(event?.groupId) === String(groupId)) refreshReminders();
    };

    socket.on('message:new', onMessage);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:removed', onMessagesRemoved);
    socket.on('typing', onTyping);
    socket.on('group:member-left', onMemberLeft);
    socket.on('group:deleted', onGroupDeleted);
    socket.on('reminder:changed', onReminderChanged);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:removed', onMessagesRemoved);
      socket.off('typing', onTyping);
      socket.off('group:member-left', onMemberLeft);
      socket.off('group:deleted', onGroupDeleted);
      socket.off('reminder:changed', onReminderChanged);
    };
  }, [
    socket,
    connected,
    groupId,
    currentUserId,
    navigation,
    applyDeleted,
    refreshForCard,
    refreshReminders,
  ]);

  // Drop any pending typing timers when leaving the screen.
  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  // Offer a task whenever the newest chat message reads like a to-do.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.type === 'text' && !m.deletedAt);
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

  const handleDeleteMessage = async (message) => {
    try {
      applyDeleted(await deleteMessage(groupId, message._id));
    } catch (err) {
      AppAlert.alert('Could not delete', err.message);
    }
  };

  const handleSend = async (text, replyTo) => {
    try {
      const message = await sendMessage(groupId, text, replyTo?._id);
      // The server also pushes this back over the socket; keep whichever lands first.
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
    } catch (err) {
      AppAlert.alert('Could not send', err.message);
    }
  };

  // A photo, document or voice note. It shows in the feed straight away from
  // the file on the phone, marked pending, and is swapped for the server's
  // message once the upload lands (or dropped again if it fails).
  const handleSendAttachment = async (file, { durationMs, replyTo } = {}) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const type = file.type?.startsWith('image/') ? 'image' : file.type?.startsWith('audio/') ? 'audio' : 'file';
    setPendingUploads((prev) => [
      ...prev,
      {
        _id: localId,
        pending: true,
        type,
        text: '',
        sender: { _id: currentUserId, name: user?.name },
        createdAt: new Date().toISOString(),
        attachment: { localUri: file.uri, name: file.name, size: file.size, durationMs },
        replyTo: replyTo ?? null,
      },
    ]);
    try {
      const message = await sendAttachment(groupId, file, { durationMs, replyTo: replyTo?._id });
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
      if (type === 'image') refreshPhotos();
    } catch (err) {
      AppAlert.alert('Could not send', `${file.name}: ${err.message}`);
    } finally {
      setPendingUploads((prev) => prev.filter((m) => m._id !== localId));
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

  const adminId = group?.admin ?? group?.createdBy?._id ?? group?.createdBy;

  // Creating, editing, switching and deleting reminders, and the sheet for it.
  const reminderActions = useReminderActions({
    groupId,
    userId: currentUserId,
    adminId,
    setReminders,
    onCreated: async () => {
      setTab('reminders');
      if (!connected) setMessages(await fetchMessages(groupId));
    },
  });

  // Both of these open the reminder sheet filled in rather than setting the
  // reminder outright: it rings on people's phones, so the time is confirmed first.
  const handleRemindFromSuggestion = () => {
    if (!suggestion) return;
    handledSuggestions.current.add(suggestion.messageId);
    reminderActions.openNew({
      title: suggestion.title,
      subtitle: `Mentioned by ${suggestion.from?.name ?? 'a member'}`,
      remindAt: defaultRemindAt(null),
    });
    setSuggestion(null);
  };

  const handleSetReminderForTask = () => {
    const task = savedTask;
    setSavedTask(null);
    if (!task) return;
    reminderActions.openNew({
      title: task.title,
      subtitle: 'Task reminder',
      remindAt: defaultRemindAt(task.dueAt),
      taskId: task._id,
    });
  };

  const handleToggleTask = async (task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t._id === task._id ? { ...t, status: nextStatus } : t))
    );
    try {
      const updated = await updateTask(task._id, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      // "Task completed" comes and goes in the chat with this.
      await refreshMessages();
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t))); // roll back
      AppAlert.alert('Could not update task', err.message);
    }
  };

  const refreshMessages = async () => {
    try {
      if (!connected) setMessages(await fetchMessages(groupId));
    } catch {
      // A stale chat feed is fine; the next poll or focus reloads it.
    }
  };

  const nextDayNumber = useMemo(() => lowestFreeDayNumber(itineraryDays), [itineraryDays]);
  // A Date whose identity only changes when the day itself does.
  const nextDayTime = dateForDayNumber(nextDayNumber, group?.startDate, itineraryDays);
  const nextDayDate = useMemo(() => new Date(nextDayTime), [nextDayTime]);

  const handleCreateDay = async (payload) => {
    try {
      const day = await createItineraryDay(groupId, { ...payload, dayNumber: nextDayNumber });
      setDaySheetOpen(false);
      // The server also announces the write (`itinerary:updated`), and that
      // refetch can land first; keep whichever copy of the day arrives last.
      setItineraryDays((prev) =>
        [...prev.filter((d) => d._id !== day._id), day].sort((a, b) => a.dayNumber - b.dayNumber)
      );
      await refreshMessages();
    } catch (err) {
      AppAlert.alert('Could not add day', err.message);
      // A conflict means the list on screen is stale: another member took this
      // day number first, or AI has just started planning.
      if (err.status === 409) refreshItinerary();
    }
  };

  // The server turns away itinerary edits while AI is writing the plan, so
  // every way into one says so up front. True when it has stopped the action.
  const blockedByAi = () => {
    if (!ai.running) return false;
    AppAlert.alert(...AI_ALERTS.running);
    return true;
  };

  const openDaySheet = () => {
    if (!blockedByAi()) setDaySheetOpen(true);
  };

  const openEditDay = (day) => {
    if (blockedByAi()) return;
    navigation.navigate('EditItineraryDay', { day, groupName: group?.name, adminId });
  };

  // "Plan with AI" / "Replan with AI" in the + menu, the nudge's chip, and the
  // failed banner's "Try again": whether this replaces days is worked out
  // afresh each time, from the days on screen now.
  const openAiPlanner = () => {
    if (blockedByAi()) return;
    // Unknown (the status hasn't answered yet) still goes through; the
    // preferences screen checks again before it shows its form.
    if (ai.configured === false || ai.configured === null) {
      AppAlert.alert(...AI_ALERTS.notConfigured);
      return;
    }
    const open = (replace) =>
      navigation.navigate('AiItineraryPrefs', {
        groupId,
        groupName: group?.name,
        replace,
        from: 'group',
      });
    if (!itineraryDays.length) {
      open(false);
      return;
    }
    // The server's rule, checked here first so the form isn't filled in for nothing.
    const canReplace =
      String(adminId) === String(currentUserId) ||
      itineraryDays.every((d) => String(d.createdBy?._id ?? d.createdBy) === String(currentUserId));
    if (!canReplace) {
      AppAlert.alert(...AI_ALERTS.replaceForbidden);
      return;
    }
    AppAlert.alert('Replace itinerary?', replaceConfirmMessage(itineraryDays.length), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => open(true) },
    ]);
  };

  const dismissAiNudge = () => {
    setAiNudgeDismissed(true);
    AsyncStorage.setItem(`${AI_NUDGE_KEY}.${groupId}`, '1').catch(() => {});
  };

  const openUploadPhotos = () => {
    navigation.navigate('UploadPhotos', { groupId, groupName: group?.name });
  };

  const openUploadVideos = () => {
    navigation.navigate('UploadPhotos', { groupId, groupName: group?.name, media: 'video' });
  };

  const openTaskDetail = (task) => {
    if (task?._id) navigation.navigate('TaskDetail', { taskId: task._id });
  };

  // ---- Chat cards ----------------------------------------------------------
  // A tap on a card goes to that thing's tab and opens it there: tasks and
  // expenses on their own screens, a reminder in its sheet, and stays,
  // attractions and gallery items by the tab itself (see `focus`).

  const openTaskFromCard = (task) => {
    setTab('tasks');
    openTaskDetail(task);
  };

  const openExpenseFromCard = (expense) => {
    setTab('expenses');
    if (expense?._id) openExpense(expense);
  };

  // The list on screen if it has the item, else a fresh one from the server
  // (another member's card can arrive before their item is in this phone's
  // list), or null when the server can't be reached.
  const listWith = async (key, list, fetcher, setter, id) =>
    list.some((item) => item._id === id) ? list : refreshList(key, fetcher, setter);

  // Switches to the card's tab and resolves to the list holding its item once
  // there is one, or to null when the tap has been overtaken meanwhile (the
  // person moved on) or the server can't be reached (the tab shows what it has).
  const listForCard = async (tabKey, item, list, fetcher, setter) => {
    const tap = { tab: tabKey };
    pendingCard.current = tap;
    setTab(tabKey);
    if (!item?._id) return null;
    const fresh = await listWith(tabKey, list, fetcher, setter, item._id);
    if (pendingCard.current !== tap) return null;
    pendingCard.current = null;
    return fresh;
  };

  const openReminderFromCard = async (reminder) => {
    const list = await listForCard('reminders', reminder, reminders, fetchReminders, setReminders);
    const found = list?.find((item) => item._id === reminder._id);
    if (found) reminderActions.openEdit(found);
  };

  const focusFromCard = async (tabKey, item, list, fetcher, setter) => {
    const fresh = await listForCard(tabKey, item, list, fetcher, setter);
    if (!fresh) return;
    if (fresh.some((entry) => entry._id === item._id)) {
      setFocus({ tab: tabKey, id: item._id });
    } else {
      AppAlert.alert('Not there any more', 'It was deleted after this card was posted.');
    }
  };
  const openStayFromCard = (stay) => focusFromCard('stays', stay, stays, fetchStays, setStays);
  const openAttractionFromCard = (attraction) =>
    focusFromCard('attractions', attraction, attractions, fetchAttractions, setAttractions);
  const openMediaFromCard = (photo) => focusFromCard('gallery', photo, photos, fetchPhotos, setPhotos);
  const focusIdFor = (tabKey) => (focus?.tab === tabKey ? focus.id : null);

  // The gallery has already asked "are you sure?". Resolves to true once the
  // photos are gone, so it knows to leave selection mode.
  const handleDeletePhotos = async (toDelete) => {
    try {
      const deletedIds = new Set(await deletePhotos(toDelete.map((p) => p._id)));
      setPhotos((prev) => prev.filter((p) => !deletedIds.has(p._id)));
      const kept = toDelete.length - deletedIds.size;
      if (kept) {
        AppAlert.alert(
          'Some were kept',
          `${kept} could not be deleted. Only the person who uploaded a photo or video can delete it.`
        );
      }
      return true;
    } catch (err) {
      AppAlert.alert('Could not delete', err.message);
      return false;
    }
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
            await refreshMessages();
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
            await refreshMessages();
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

  // What the "+" offers on each tab: everything on Chat, only that tab's own
  // things elsewhere. A tab with a single action skips the menu and opens it.
  const ACTION = {
    task: {
      key: 'task',
      icon: 'checkmark',
      tint: '#22C55E',
      label: 'Add Task',
      onPress: () => openTaskSheet(null),
    },
    reminder: {
      key: 'reminder',
      icon: 'notifications-outline',
      tint: '#2DD4BF',
      label: 'Add Reminder',
      onPress: () => reminderActions.openNew(),
    },
    expense: {
      key: 'expense',
      icon: 'cash-outline',
      tint: '#22C55E',
      label: 'Add Expense',
      onPress: openAddExpense,
    },
    friends: {
      key: 'friends',
      icon: 'person-add-outline',
      tint: '#2DD4BF',
      label: 'Invite Friends',
      onPress: () => navigation.navigate('GroupInvite', { group }),
    },
    stay: {
      key: 'stay',
      icon: 'bed-outline',
      tint: '#2DD4BF',
      label: 'Add Stay',
      onPress: () => setStaySheetOpen(true),
    },
    attraction: {
      key: 'attraction',
      icon: 'compass-outline',
      tint: '#2DD4BF',
      label: 'Add Attraction',
      onPress: () => setAttractionSheetOpen(true),
    },
    photos: {
      key: 'photos',
      icon: 'images-outline',
      tint: '#2DD4BF',
      label: 'Upload Photos',
      onPress: openUploadPhotos,
    },
    videos: {
      key: 'videos',
      icon: 'videocam-outline',
      tint: '#2DD4BF',
      label: 'Upload Videos',
      onPress: openUploadVideos,
    },
    day: {
      key: 'day',
      icon: 'map-outline',
      tint: '#2DD4BF',
      label: 'Add Day',
      onPress: openDaySheet,
    },
    ai: {
      key: 'ai',
      icon: 'sparkles',
      tint: '#4A8CFF',
      label: itineraryDays.length ? 'Replan with AI' : 'Plan with AI',
      onPress: openAiPlanner,
    },
  };

  const memberCount = group?.members?.length ?? 0;

  const headerSubtitle = useMemo(() => {
    const parts = [`${memberCount} member${memberCount === 1 ? '' : 's'}`];
    if (group?.totalDays) parts.push(`${group.totalDays} days`);
    return parts.join(' · ');
  }, [memberCount, group?.totalDays]);

  // While the type is still unknown (no hint, group not loaded) the full bar
  // shows, as it always has; it is trimmed only once the group is known not to
  // be a trip.
  const groupType = group?.groupType ?? groupTypeHint;
  const tripTabsHidden = Boolean(groupType) && groupType !== 'trip';
  const tabs = tripTabsHidden ? TABS_WITHOUT_TRIP : TABS;

  // A notification, a deep link or an older screen can still ask for a tab
  // this group does not have. Chat is where it lands instead.
  useEffect(() => {
    if (tripTabsHidden && TRIP_ONLY_TABS.has(tab)) setTab('chat');
  }, [tripTabsHidden, tab]);

  const fabActions = (
    {
      chat: [
        ACTION.task,
        ACTION.reminder,
        ACTION.expense,
        ACTION.friends,
        ACTION.stay,
        // Attractions are a trip's alone (the server refuses them elsewhere).
        !tripTabsHidden && ACTION.attraction,
        ACTION.photos,
        ACTION.videos,
      ],
      expenses: [ACTION.expense],
      tasks: [ACTION.task],
      reminders: [ACTION.reminder],
      itinerary: [ACTION.day, group?.groupType === 'trip' && ACTION.ai],
      gallery: [ACTION.photos, ACTION.videos],
      attractions: [ACTION.attraction],
      stays: [ACTION.stay],
    }[tab] ?? []
  ).filter(Boolean);

  // One action: straight to it. Several: the menu.
  const pressFab = () => {
    if (fabActions.length === 1) {
      setActionsOpen(false);
      fabActions[0].onPress();
    } else {
      setActionsOpen((open) => !open);
    }
  };

  // Each tab has its own actions, so a menu left open does not follow to the
  // next. A card tap or focus meant for another tab is dropped as well.
  useEffect(() => {
    setActionsOpen(false);
    if (pendingCard.current && pendingCard.current.tab !== tab) pendingCard.current = null;
    setFocus((current) => (current && current.tab !== tab ? null : current));
  }, [tab]);

  // Running, or done with the new days still on their way.
  const aiBusy = ai.running || ai.settling;
  // Only once the server has said AI is set up: never while that is unknown,
  // so the nudge can't appear and then take itself back.
  const showAiNudge =
    !loading &&
    !itineraryDays.length &&
    group?.groupType === 'trip' &&
    ai.configured === true &&
    !aiBusy &&
    !aiNudgeDismissed;

  return (
    // The chat composer pads itself down to the navigation bar. Every other
    // tab ends in a list and the floating button, so the screen stops above
    // the bar for them. Done as padding because the safe area does not pick
    // up its edges changing while the screen is open.
    <DarkScreen edges={TOP_ONLY} style={tab !== 'chat' && { paddingBottom: insets.bottom }}>
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

      <AiItineraryBanner
        banner={ai.banner}
        job={ai.job}
        isMine={ai.isMine}
        onOpen={() => setTab('itinerary')}
        onRetry={openAiPlanner}
        onDismiss={ai.dismiss}
      />

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {tabs.map((item) => {
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
          messages={feed}
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
          onSendAttachment={handleSendAttachment}
          onDeleteMessage={handleDeleteMessage}
          onTyping={handleTyping}
          typingUsers={Object.values(typingUsers)}
          onOpenExpense={openExpenseFromCard}
          onOpenTask={openTaskFromCard}
          onOpenReminders={openReminderFromCard}
          onOpenStay={openStayFromCard}
          onOpenAttraction={openAttractionFromCard}
          onOpenMedia={openMediaFromCard}
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
        <RemindersTab
          reminders={reminders}
          loading={loading}
          onToggle={reminderActions.toggle}
          onOpen={reminderActions.openEdit}
        />
      )}

      {tab === 'itinerary' && !tripTabsHidden && (
        <View style={styles.flex}>
          {showAiNudge && (
            <View style={styles.aiNudge}>
              <View style={styles.aiNudgeBadge}>
                <Ionicons name="sparkles" size={11} color="#04121C" />
              </View>
              <Text style={styles.aiNudgeText} numberOfLines={1}>
                Let AI plan this trip
              </Text>
              <TouchableOpacity
                style={styles.aiNudgeChip}
                activeOpacity={0.85}
                onPress={openAiPlanner}
              >
                <Text style={styles.aiNudgeChipText}>Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={dismissAiNudge} hitSlop={styles.hitSlop}>
                <Ionicons name="close" size={16} color={dark.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* The working view stands in for the empty state only. `aiBusy`
              covers the gap between "done" and the new days arriving, so "No
              itinerary yet" can't flash in between. */}
          {aiBusy && !itineraryDays.length && !loading ? (
            <AiWorkingView title={aiRunningText(ai.job, ai.isMine)} />
          ) : (
            <ItineraryTab
              key={itineraryKey}
              days={itineraryDays}
              loading={loading}
              onAddDay={openDaySheet}
              onEditDay={openEditDay}
            />
          )}
        </View>
      )}

      {tab === 'gallery' && (
        <GalleryTab
          photos={photos}
          loading={loading}
          currentUserId={currentUserId}
          onAddPhoto={openUploadPhotos}
          onDeletePhotos={handleDeletePhotos}
          focusId={focusIdFor('gallery')}
          onFocusDone={clearFocus}
        />
      )}

      {tab === 'attractions' && !tripTabsHidden && (
        <AttractionsTab
          attractions={attractions}
          loading={loading}
          currentUserId={currentUserId}
          onToggleSave={handleToggleSaveAttraction}
          onDelete={handleDeleteAttraction}
          focusId={focusIdFor('attractions')}
          onFocusDone={clearFocus}
        />
      )}

      {tab === 'stays' && (
        <StaysTab
          stays={stays}
          loading={loading}
          organiserId={group?.admin ?? group?.createdBy?._id ?? group?.createdBy}
          onToggleStatus={handleToggleStayStatus}
          onDelete={handleDeleteStay}
          focusId={focusIdFor('stays')}
          onFocusDone={clearFocus}
        />
      )}

      {/* In the chat the button floats above the composer so it never covers
          Send, and steps aside entirely while the keyboard is up. */}
      {(tab !== 'chat' || !suggestion) && !(tab === 'chat' && keyboardVisible) ? (
        <View
          style={[
            styles.fabWrap,
            // Pinned, so the screen's padding does not move it: it clears the
            // navigation bar itself.
            {
              bottom:
                tab === 'chat'
                  ? composerBottomPadding(insets) + COMPOSER_HEIGHT + 14
                  : insets.bottom + spacing.xl,
            },
          ]}
        >
          {actionsOpen && fabActions.length > 1 && (
            <View style={styles.actionMenu}>
              {fabActions.map((item, index) => (
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

          <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={pressFab}>
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
        nextDayNumber={nextDayNumber}
        defaultDate={nextDayDate}
        onClose={() => setDaySheetOpen(false)}
        onSubmit={handleCreateDay}
      />

      <ReminderSheet {...reminderActions.sheetProps} />

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

  flex: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },

  // "Let AI plan this trip", above an empty Itinerary tab. The Splix Suggest
  // card's colours on a single row.
  aiNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: '#0F1A20',
    borderWidth: 1,
    borderColor: 'rgba(0,196,208,0.35)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  aiNudgeBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiNudgeText: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600' },
  aiNudgeChip: {
    backgroundColor: dark.accentGreen,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  aiNudgeChipText: { color: '#04121C', fontSize: 13, fontWeight: '700' },

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
