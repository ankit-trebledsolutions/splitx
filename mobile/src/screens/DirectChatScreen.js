import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DarkScreen from '../components/DarkScreen';
import Avatar from '../components/Avatar';
import TypingDots from '../components/TypingDots';
import AppAlert from '../components/AppAlert';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketProvider';
import useKeyboardVisible from '../hooks/useKeyboardVisible';
import useKeyboardLift from '../hooks/useKeyboardLift';
import {
  openConversation,
  fetchConversation,
  fetchDirectMessages,
  sendDirectMessage,
} from '../api/direct.api';
import { presenceFrom } from '../utils/presence';
import { formatTime } from '../utils/format';
import { dark, spacing } from '../theme';

const MESSAGE_PAGE = 50;
// One "typing" event per burst of keystrokes; the other side hides the dots
// on its own if a "stopped" event never arrives (app killed, signal lost).
const TYPING_THROTTLE_MS = 2000;
const TYPING_IDLE_MS = 3000;
const TYPING_EXPIRY_MS = 6000;

const IS_IOS = Platform.OS === 'ios';
const Root = IS_IOS ? KeyboardAvoidingView : View;

const sameDay = (a, b) => a.toDateString() === b.toDateString();

// "TODAY, 10:24 AM" / "YESTERDAY, 9:05 PM" / "SEP 14, 10:24 AM"
const dayLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = sameDay(date, today)
    ? 'TODAY'
    : sameDay(date, yesterday)
      ? 'YESTERDAY'
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
  return `${day}, ${formatTime(date)}`;
};

const Bubble = React.memo(({ message, mine }) =>
  mine ? (
    <LinearGradient
      colors={dark.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.bubble, styles.bubbleMine]}
    >
      <Text style={[styles.bubbleText, styles.bubbleTextMine]}>{message.text}</Text>
      <Text style={[styles.time, styles.timeMine]}>{formatTime(message.createdAt)}</Text>
    </LinearGradient>
  ) : (
    <View style={[styles.bubble, styles.bubbleTheirs]}>
      <Text style={styles.bubbleText}>{message.text}</Text>
      <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
    </View>
  )
);

const keyOf = (item) => item._id;

/**
 * One-to-one chat. Opened from a member's profile with `peer`, or from a push
 * notification with only `conversationId`.
 */
const DirectChatScreen = ({ route, navigation }) => {
  const { peer: initialPeer, conversationId: initialConversationId } = route.params ?? {};
  const { user } = useAuth();
  const currentUserId = user?._id;
  const { socket, connected } = useSocket();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { lift, onLayout } = useKeyboardLift();

  const [peer, setPeer] = useState(initialPeer ?? null);
  const [conversationId, setConversationId] = useState(initialConversationId ?? null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [presence, setPresence] = useState({ online: false, lastSeenAt: initialPeer?.lastSeenAt });

  const listRef = useRef(null);
  const hasOlder = useRef(true);
  const fetchingOlder = useRef(false);
  const latestAt = useRef(null);
  const lastTypingSent = useRef(0);
  const typingIdleTimer = useRef(null);
  const typingExpiryTimer = useRef(null);

  const appendUnique = useCallback((message) => {
    setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
  }, []);

  // Resolve the conversation (creating it on first contact) and load the newest page.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const conversation = initialConversationId
          ? await fetchConversation(initialConversationId)
          : await openConversation(initialPeer._id);
        if (!active) return;
        setConversationId(conversation._id);
        setPeer(conversation.participants.find((p) => p._id !== currentUserId) ?? initialPeer);

        const page = await fetchDirectMessages(conversation._id, { limit: MESSAGE_PAGE });
        if (!active) return;
        hasOlder.current = page.length >= MESSAGE_PAGE;
        setMessages(page);
      } catch (err) {
        if (!active) return;
        AppAlert.alert('Could not open chat', err.message, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialConversationId, initialPeer, currentUserId, navigation]);

  useEffect(() => {
    latestAt.current = messages.length ? messages[messages.length - 1].createdAt : null;
  }, [messages]);

  // Live: new messages, the other person's typing and presence. Re-runs on
  // every reconnect, where it also fetches whatever was missed meanwhile.
  useEffect(() => {
    if (!socket || !connected || !conversationId) return undefined;

    // Tells the server this chat is on screen, so it doesn't also send a push.
    socket.emit('dm:open', { conversationId });
    socket.emit('dm:presence', { conversationId }, (state) => state && setPresence(state));

    (async () => {
      if (!latestAt.current) return;
      try {
        const missed = await fetchDirectMessages(conversationId, { after: latestAt.current });
        missed.forEach(appendUnique);
      } catch {
        // The next reconnect retries.
      }
    })();

    const onMessage = (event) => {
      if (event.conversationId !== conversationId) return;
      appendUnique(event.message);
      // Their message landing means they've stopped typing it.
      if (event.message.sender?._id !== currentUserId) setPeerTyping(false);
    };
    const onTyping = (event) => {
      if (event.conversationId !== conversationId || event.userId === currentUserId) return;
      setPeerTyping(event.typing);
      clearTimeout(typingExpiryTimer.current);
      if (event.typing) {
        typingExpiryTimer.current = setTimeout(() => setPeerTyping(false), TYPING_EXPIRY_MS);
      }
    };
    const onPresence = (event) => {
      if (event.userId !== peer?._id) return;
      setPresence({ online: event.online, lastSeenAt: event.lastSeenAt });
    };

    socket.on('dm:new', onMessage);
    socket.on('dm:typing', onTyping);
    socket.on('presence:update', onPresence);
    return () => {
      socket.emit('dm:typing', { conversationId, typing: false });
      socket.emit('dm:close');
      socket.off('dm:new', onMessage);
      socket.off('dm:typing', onTyping);
      socket.off('presence:update', onPresence);
    };
  }, [socket, connected, conversationId, currentUserId, peer?._id, appendUnique]);

  useEffect(
    () => () => {
      clearTimeout(typingIdleTimer.current);
      clearTimeout(typingExpiryTimer.current);
    },
    []
  );

  const sendTyping = useCallback(
    (typing) => {
      if (!socket || !connected || !conversationId) return;
      const now = Date.now();
      if (typing && now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
      lastTypingSent.current = typing ? now : 0;
      socket.emit('dm:typing', { conversationId, typing });
    },
    [socket, connected, conversationId]
  );

  const onChangeDraft = (value) => {
    setDraft(value);
    clearTimeout(typingIdleTimer.current);
    if (!value.trim()) {
      sendTyping(false);
      return;
    }
    sendTyping(true);
    // Paused mid-sentence: stop showing the dots on the other side.
    typingIdleTimer.current = setTimeout(() => sendTyping(false), TYPING_IDLE_MS);
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || !conversationId) return;
    setDraft('');
    clearTimeout(typingIdleTimer.current);
    sendTyping(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    try {
      // The server also pushes it back over the socket; keep whichever lands first.
      appendUnique(await sendDirectMessage(conversationId, text));
    } catch (err) {
      setDraft((current) => current || text);
      AppAlert.alert('Could not send', err.message);
    }
  };

  const loadOlder = useCallback(async () => {
    if (fetchingOlder.current || !hasOlder.current || !messages.length || !conversationId) return;
    fetchingOlder.current = true;
    setLoadingOlder(true);
    try {
      const older = await fetchDirectMessages(conversationId, {
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
  }, [conversationId, messages]);

  // Newest first for the inverted list; each day's label goes after that day's
  // messages so it is drawn above them.
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (const message of messages) {
      const day = new Date(message.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ _id: `day-${day}`, label: dayLabel(message.createdAt) });
        lastDay = day;
      }
      out.push(message);
    }
    return out.reverse();
  }, [messages]);

  const renderRow = useCallback(
    ({ item }) =>
      item.label ? (
        <Text style={styles.dayLabel}>{item.label}</Text>
      ) : (
        <Bubble message={item} mine={(item.sender?._id ?? item.sender) === currentUserId} />
      ),
    [currentUserId]
  );

  const status = presenceFrom(presence.online, presence.lastSeenAt);
  const canSend = draft.trim().length > 0;

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIcon} onPress={navigation.goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>

        <View style={styles.headerPeer}>
          <View>
            <Avatar name={peer?.name} size={38} solid />
            {status.online && <View style={styles.onlineDot} />}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {peer?.name ?? 'Chat'}
            </Text>
            <Text style={[styles.headerStatus, status.online && styles.headerStatusOnline]}>
              {peerTyping ? 'typing…' : status.label}
            </Text>
          </View>
        </View>

        {/* Keeps the name centred against the back button. */}
        <View style={styles.headerSpacer} />
      </View>

      <Root
        style={[styles.flex, !IS_IOS && { paddingBottom: lift }]}
        {...(IS_IOS ? { behavior: 'padding' } : { onLayout })}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={dark.accentGreen} />
          </View>
        ) : rows.length === 0 && !peerTyping ? (
          <View style={styles.center}>
            <Text style={styles.empty}>
              No messages yet. Say hello to {peer?.name?.split(' ')[0] ?? 'them'}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={keyOf}
            renderItem={renderRow}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            initialNumToRender={16}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews={!IS_IOS}
            // Inverted: the header is drawn at the bottom, under the newest message.
            ListHeaderComponent={peerTyping ? <TypingDots style={styles.typing} /> : null}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={dark.accentGreen} style={styles.older} /> : null
            }
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: keyboardVisible ? spacing.sm + 2 : Math.max(insets.bottom, spacing.sm + 4) },
          ]}
        >
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={onChangeDraft}
              placeholder="Message..."
              placeholderTextColor={dark.textMuted}
              multiline
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonIdle]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={17} color={canSend ? '#04241A' : dark.textMuted} />
          </TouchableOpacity>
        </View>
      </Root>
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36 },
  headerPeer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  headerText: { flexShrink: 1 },
  headerName: { color: dark.text, fontSize: 16, fontWeight: '800' },
  headerStatus: { color: dark.textMuted, fontSize: 12, marginTop: 1 },
  headerStatusOnline: { color: dark.accentGreen },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: dark.background,
  },

  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  older: { paddingVertical: spacing.md },
  typing: { marginTop: spacing.xs, marginBottom: spacing.xs },
  dayLabel: {
    alignSelf: 'center',
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginVertical: spacing.md,
  },
  empty: { color: dark.textMuted, fontSize: 13, textAlign: 'center' },

  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: spacing.md - 2,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm + 2,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
  },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleText: { color: dark.text, fontSize: 14.5, lineHeight: 21 },
  bubbleTextMine: { color: '#04121C' },
  time: { color: dark.textMuted, fontSize: 10, marginTop: 4 },
  timeMine: { color: 'rgba(4,18,28,0.6)', alignSelf: 'flex-end' },

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
  inputWrap: {
    flex: 1,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 21,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 6,
  },
  input: {
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
  sendButtonIdle: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border },
});

export default DirectChatScreen;
