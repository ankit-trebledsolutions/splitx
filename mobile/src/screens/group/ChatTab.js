import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  Keyboard,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatMessage, { USER_TYPES } from '../../components/ChatMessage';
import TypingDots from '../../components/TypingDots';
import { avatarColor } from '../../components/Avatar';
import useKeyboardVisible from '../../hooks/useKeyboardVisible';
import useKeyboardLift from '../../hooks/useKeyboardLift';
import { dark, radius, spacing } from '../../theme';
import { formatDayDivider } from '../../utils/format';
import ImageViewer from '../../components/ImageViewer';
import AppAlert from '../../components/AppAlert';
import {
  absoluteUrl,
  canUseVoiceNotes,
  messageSnippet,
  pickChatDocuments,
  pickChatPhotos,
  PickerPermissionError,
} from '../../utils/attachments';
import { savePhotoToGallery, SavePermissionError } from '../../utils/saveToGallery';
import { loadSavedFileIds, saveFileToPhone, SaveCancelledError } from '../../utils/saveToPhone';
import { copyText } from '../../utils/clipboard';
import SwipeToReply from '../../components/SwipeToReply';
import MessageActionsSheet from '../../components/MessageActionsSheet';

// Needs the expo-audio native module, which older installed builds don't have.
const VoiceRecorderBar = canUseVoiceNotes()
  ? require('../../components/VoiceRecorderBar').default
  : null;

const ATTACH_OPTIONS = [
  { key: 'photos', icon: 'images-outline', tint: '#2DD4BF', label: 'Photos', pick: pickChatPhotos },
  {
    key: 'document',
    icon: 'document-text-outline',
    tint: '#4A7DF7',
    label: 'Document',
    pick: pickChatDocuments,
  },
];

// Height of the composer bar above its bottom padding: 10 top padding + 42 controls.
// The parent uses it to float its "+" button just above the bar.
export const COMPOSER_HEIGHT = 52;
export const composerBottomPadding = (insets) => Math.max(insets.bottom, spacing.sm + 4);

// iOS keeps KeyboardAvoidingView; Android lifts the bar itself (see useKeyboardLift).
const IS_IOS = Platform.OS === 'ios';
const Root = IS_IOS ? KeyboardAvoidingView : View;

// How far up (px) the reader has to be before the "jump to latest" button shows.
const JUMP_BUTTON_AFTER = 400;

// How many older pages to load looking for a quoted message before giving up.
const MAX_PAGES_TO_FIND = 6;

/**
 * Chat feed + composer. The suggest banner is driven by the parent so the
 * detected task can be handed straight to the New Task sheet.
 *
 * The feed is an inverted list: index 0 is the newest message, pinned to the
 * bottom. That makes the chat open on the latest message with no scrolling,
 * new messages slide in at the bottom on their own, and older pages load when
 * the reader reaches the top.
 */
const ChatTab = ({
  messages,
  loading,
  loadingOlder = false,
  onLoadOlder,
  onOpenCamera,
  // True while the parent's floating "+" sits over the feed's bottom-right corner.
  fabVisible = false,
  currentUserId,
  suggestion,
  onDismissSuggestion,
  onAddSuggestionToTasks,
  onRemindSuggestion,
  // (text, replyTo): replyTo is the message being answered, or null.
  onSend,
  // (file, { durationMs, replyTo }) for a picked photo or document, or a recorded voice note.
  onSendAttachment,
  // "Delete for everyone" on one of my own messages; the parent confirms nothing, we do.
  onDeleteMessage,
  onTyping,
  typingUsers = [],
  onOpenExpense,
  onOpenTask,
  onOpenReminders,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [savingImage, setSavingImage] = useState(false);
  // The message being answered (shown above the composer) and the one whose
  // long-press sheet is open.
  const [replyingTo, setReplyingTo] = useState(null);
  const [actionsFor, setActionsFor] = useState(null);
  // Voice notes and documents already copied to this phone / downloading now.
  const [savedFileIds, setSavedFileIds] = useState(() => new Set());
  const [savingFileIds, setSavingFileIds] = useState(() => new Set());
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadSavedFileIds().then((ids) => active && setSavedFileIds(ids));
    return () => {
      active = false;
    };
  }, []);

  // Takes the pending reply, clearing the bar: whatever is sent next carries it.
  const takeReply = () => {
    const reply = replyingTo;
    setReplyingTo(null);
    return reply;
  };

  const startReply = useCallback((message) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  }, []);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { lift, onLayout } = useKeyboardLift();

  // Newest first, with each day's divider placed after that day's messages so
  // the inverted list draws it above them.
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
    return out.reverse();
  }, [messages]);

  // A message that arrives while the reader is scrolled up lights the jump button.
  const newestId = messages.length ? messages[messages.length - 1]._id : null;
  const awayRef = useRef(false);
  useEffect(() => {
    if (awayRef.current && newestId) setUnseen(true);
  }, [newestId]);

  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnseen(false);
  }, []);

  // Tapping the quote above a reply: scroll to the message it answers and tint
  // it for a moment. If that message is further back than what is loaded, older
  // pages are pulled in until it turns up.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const loadOlderRef = useRef(onLoadOlder);
  loadOlderRef.current = onLoadOlder;
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);
  const jumping = useRef(false);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const jumpToMessage = useCallback(async (messageId) => {
    if (!messageId || jumping.current) return;
    jumping.current = true;
    try {
      let index = rowsRef.current.findIndex((row) => row._id === messageId);
      for (let page = 0; index < 0 && page < MAX_PAGES_TO_FIND; page += 1) {
        const before = rowsRef.current.length;
        // eslint-disable-next-line no-await-in-loop
        await loadOlderRef.current?.();
        // Give the new page a moment to reach the list.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (rowsRef.current.length === before) break; // nothing older left
        index = rowsRef.current.findIndex((row) => row._id === messageId);
      }
      if (index < 0) {
        AppAlert.alert('Message not found', 'The original message is too far back to show.');
        return;
      }
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlightId(messageId);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
    } finally {
      jumping.current = false;
    }
  }, []);

  // Rows vary in height, so a far-off index may not be measured yet: scroll to
  // roughly the right place, then try again once those rows have rendered.
  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }) => {
    listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
    setTimeout(
      () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }),
      150
    );
  }, []);

  const onScroll = useCallback((event) => {
    const away = event.nativeEvent.contentOffset.y > JUMP_BUTTON_AFTER;
    if (away === awayRef.current) return;
    awayRef.current = away;
    setAwayFromLatest(away);
    if (!away) setUnseen(false);
  }, []);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    onTyping?.(false);
    setSending(true);
    setDraft('');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    try {
      await onSend(text, takeReply());
    } finally {
      setSending(false);
    }
  };

  // Attach menu: open the chosen picker and send whatever comes back, one
  // message per file, the way WhatsApp does.
  const attach = async (option) => {
    setAttachOpen(false);
    try {
      const { files, skipped } = await option.pick();
      if (skipped) AppAlert.alert('Some files skipped', 'Files over 10MB were left out.');
      if (!files.length) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      // Of several files, the first one is the reply.
      const replyTo = takeReply();
      files.forEach((file, index) => onSendAttachment?.(file, { replyTo: index === 0 ? replyTo : null }));
    } catch (err) {
      AppAlert.alert(
        err instanceof PickerPermissionError ? 'Permission needed' : 'Could not attach',
        err.message
      );
    }
  };

  const startRecording = () => {
    if (!VoiceRecorderBar) {
      AppAlert.alert('Update needed', 'Install the latest build of Splix to send voice notes.');
      return;
    }
    setAttachOpen(false);
    Keyboard.dismiss();
    setRecording(true);
  };

  const sendVoiceNote = ({ durationMs, ...file }) => {
    setRecording(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    onSendAttachment?.(file, { durationMs, replyTo: takeReply() });
  };

  const openFile = useCallback((message) => {
    const url = absoluteUrl(message.attachment?.url);
    if (url) Linking.openURL(url).catch((err) => AppAlert.alert('Could not open file', err.message));
  }, []);

  // Voice notes and documents: keep a copy on the phone (see saveToPhone).
  const saveFile = useCallback(async (message) => {
    const url = absoluteUrl(message.attachment?.url);
    if (!url) return;
    setSavingFileIds((prev) => new Set(prev).add(message._id));
    try {
      await saveFileToPhone(message._id, url, message.attachment);
      setSavedFileIds((prev) => new Set(prev).add(message._id));
    } catch (err) {
      if (!(err instanceof SaveCancelledError)) AppAlert.alert('Could not save file', err.message);
    } finally {
      setSavingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(message._id);
        return next;
      });
    }
  }, []);

  // A photo from the chat into the phone's own gallery: from the full-screen
  // viewer's download button, or straight from the long-press sheet.
  const saveImage = async (message) => {
    const uri = absoluteUrl(message?.attachment?.url);
    if (!uri) return;
    setSavingImage(true);
    try {
      await savePhotoToGallery(message._id, uri);
      setViewing(null);
      AppAlert.alert('Photo saved', 'It is in your phone’s gallery now.');
    } catch (err) {
      setViewing(null);
      if (err instanceof SavePermissionError) {
        AppAlert.alert(
          'Allow photo access',
          'Splix needs permission to add photos to your gallery.',
          err.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
        );
      } else {
        AppAlert.alert('Could not save photo', err.message);
      }
    } finally {
      setSavingImage(false);
    }
  };

  const confirmDelete = (message) =>
    AppAlert.alert('Delete message?', 'It will be removed for everyone in the group.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete for everyone', style: 'destructive', onPress: () => onDeleteMessage?.(message) },
    ]);

  // What the long-press sheet offers for a message.
  const actionsOf = (message) => {
    if (!message) return [];
    const mine = message.sender?._id === currentUserId;
    const isFile = message.type === 'audio' || message.type === 'file';
    return [
      { key: 'reply', icon: 'arrow-undo-outline', label: 'Reply', onPress: () => startReply(message) },
      message.text && {
        key: 'copy',
        icon: 'copy-outline',
        label: 'Copy',
        onPress: () => copyText(message.text),
      },
      message.type === 'image' && {
        key: 'save-image',
        icon: 'download-outline',
        label: 'Save to phone gallery',
        onPress: () => saveImage(message),
      },
      isFile &&
        !savedFileIds.has(message._id) && {
          key: 'save-file',
          icon: 'download-outline',
          label: 'Save to phone',
          onPress: () => saveFile(message),
        },
      mine && {
        key: 'delete',
        icon: 'trash-outline',
        label: 'Delete',
        destructive: true,
        onPress: () => confirmDelete(message),
      },
    ].filter(Boolean);
  };

  // The parent passes fresh closures every render; routing them through a ref
  // keeps renderRow stable so memoised rows don't all re-render per message.
  const handlers = useRef({});
  handlers.current = { onOpenExpense, onOpenTask, onOpenReminders };
  const openExpense = useCallback((...args) => handlers.current.onOpenExpense?.(...args), []);
  const openTask = useCallback((...args) => handlers.current.onOpenTask?.(...args), []);
  const openReminders = useCallback((...args) => handlers.current.onOpenReminders?.(...args), []);

  const renderRow = useCallback(
    ({ item }) => {
      if (item.divider) {
        return (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{item.divider}</Text>
            <View style={styles.dividerLine} />
          </View>
        );
      }
      const row = (
        <ChatMessage
          message={item}
          currentUserId={currentUserId}
          saved={savedFileIds.has(item._id)}
          saving={savingFileIds.has(item._id)}
          onOpenExpense={openExpense}
          onOpenTask={openTask}
          onOpenReminders={openReminders}
          onOpenImage={setViewing}
          onOpenFile={openFile}
          onSaveFile={saveFile}
          onLongPress={setActionsFor}
          onOpenQuote={jumpToMessage}
          highlighted={highlightId === item._id}
        />
      );
      // Only what people wrote can be answered: not cards, system lines,
      // deleted messages or uploads still on their way.
      const canReply = USER_TYPES.includes(item.type) && !item.pending && !item.deletedAt;
      return canReply ? <SwipeToReply onReply={() => startReply(item)}>{row}</SwipeToReply> : row;
    },
    [
      currentUserId,
      openExpense,
      openTask,
      openReminders,
      openFile,
      saveFile,
      startReply,
      jumpToMessage,
      highlightId,
      savedFileIds,
      savingFileIds,
    ]
  );

  return (
    <Root
      style={[styles.flex, !IS_IOS && { paddingBottom: lift }]}
      {...(IS_IOS ? { behavior: 'padding', keyboardVerticalOffset: 90 } : { onLayout })}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={dark.accentGreen} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.flex}>
          <Text style={styles.empty}>No messages yet — say hello to your group.</Text>
        </View>
      ) : (
        <View style={styles.flex}>
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={keyOf}
            renderItem={renderRow}
            // Inverted, so paddingTop is the gap under the newest message: enough
            // to keep it clear of the floating button.
            contentContainerStyle={[styles.list, fabVisible && !keyboardVisible && styles.listUnderFab]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={onScroll}
            onScrollToIndexFailed={onScrollToIndexFailed}
            scrollEventThrottle={64}
            onEndReached={onLoadOlder}
            onEndReachedThreshold={0.4}
            // Keeps the reader's place when messages arrive or older ones load,
            // and follows new messages when they're already near the bottom.
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            initialNumToRender={14}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={dark.accentGreen} style={styles.older} /> : null
            }
          />

          {awayFromLatest && (
            <TouchableOpacity
              style={[styles.jump, fabVisible && !keyboardVisible && styles.jumpAboveFab]}
              activeOpacity={0.85}
              onPress={jumpToLatest}
            >
              <Ionicons name="chevron-down" size={18} color={dark.text} />
              {unseen && <View style={styles.jumpDot} />}
            </TouchableOpacity>
          )}
        </View>
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

      {typingUsers.length > 0 && (
        <TypingDots
          style={styles.typing}
          label={typingLabel(typingUsers)}
          labelColor={typingUsers.length === 1 ? avatarColor(typingUsers[0]) : undefined}
        />
      )}

      {/* Tapping anywhere outside the attach menu closes it. Drawn before the
          menu and composer so those stay on top and keep their own touches. */}
      {attachOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAttachOpen(false)} />
      )}

      {attachOpen && (
        <View style={styles.attachMenu}>
          {ATTACH_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={styles.attachItem}
              activeOpacity={0.8}
              onPress={() => attach(option)}
            >
              <View style={[styles.attachIcon, { backgroundColor: `${option.tint}26` }]}>
                <Ionicons name={option.icon} size={20} color={option.tint} />
              </View>
              <Text style={styles.attachLabel}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* The message being answered; whatever is sent next (text, file or
          voice note) goes out as a reply to it. */}
      {replyingTo && (
        <View style={styles.replyBar}>
          <Ionicons name="arrow-undo" size={15} color={dark.accentGreen} />
          <View style={styles.replyBody}>
            <Text style={styles.replyName} numberOfLines={1}>
              Replying to{' '}
              {replyingTo.sender?._id === currentUserId ? 'yourself' : replyingTo.sender?.name}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {messageSnippet(replyingTo)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={styles.hitSlop}>
            <Ionicons name="close" size={17} color={dark.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Clear the gesture bar when resting at the bottom; sit tight on the keyboard otherwise. */}
      {recording ? (
        <VoiceRecorderBar
          style={{ paddingBottom: composerBottomPadding(insets) }}
          onSend={sendVoiceNote}
          onCancel={() => setRecording(false)}
        />
      ) : (
      <View
        style={[
          styles.composer,
          { paddingBottom: keyboardVisible ? spacing.sm + 2 : composerBottomPadding(insets) },
        ]}
      >
        <TouchableOpacity
          style={[styles.iconButton, attachOpen && styles.iconButtonActive]}
          activeOpacity={0.7}
          onPress={() => setAttachOpen((open) => !open)}
        >
          <Ionicons
            name={attachOpen ? 'close' : 'attach'}
            size={20}
            color={attachOpen ? dark.accentGreen : dark.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              onTyping?.(value.trim().length > 0);
            }}
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
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} onPress={onOpenCamera}>
              <Ionicons name="camera-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7} onPress={startRecording}>
              <Ionicons name="mic-outline" size={19} color={dark.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>
      )}

      <ImageViewer
        image={
          viewing && {
            uri: absoluteUrl(viewing.attachment?.url),
            title: viewing.sender?._id === currentUserId ? 'You' : viewing.sender?.name,
            caption: viewing.text,
          }
        }
        onClose={() => setViewing(null)}
        onSave={() => saveImage(viewing)}
        saving={savingImage}
      />

      <MessageActionsSheet
        visible={Boolean(actionsFor)}
        preview={messageSnippet(actionsFor)}
        actions={actionsOf(actionsFor)}
        onClose={() => setActionsFor(null)}
      />
    </Root>
  );
};

const keyOf = (item) => item._id;

// "Alex" / "Alex & Sam" / "Alex, Sam & 2 others"
const typingLabel = (names) => {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} & ${others} other${others === 1 ? '' : 's'}`;
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listUnderFab: { paddingTop: 76 },
  older: { paddingVertical: spacing.md },
  jump: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpAboveFab: { bottom: 84, right: spacing.lg + 9 },
  jumpDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dark.accentGreen,
    borderWidth: 2,
    borderColor: dark.card2,
  },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  empty: { color: dark.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
  typing: { marginLeft: spacing.md, marginBottom: spacing.sm },

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
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: '#080D10',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: dark.card2,
    borderLeftWidth: 3,
    borderLeftColor: dark.accentGreen,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  replyBody: { flex: 1 },
  replyName: { color: dark.accentGreen, fontSize: 11, fontWeight: '800' },
  replyText: { color: dark.textMuted, fontSize: 12, marginTop: 1 },
  iconButtonActive: { borderColor: dark.accentGreen },
  attachMenu: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignSelf: 'flex-start',
    marginLeft: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: dark.card2,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  attachItem: { alignItems: 'center', gap: 6 },
  attachIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: { color: dark.text, fontSize: 11, fontWeight: '600' },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 21,
    minHeight: 42,
    paddingLeft: spacing.md + 2,
    paddingRight: spacing.md - 2,
    paddingVertical: 6,
  },
  // Android adds its own text padding and baseline offset; zero them so the
  // text sits centred in the pill at one line and grows evenly after that.
  input: {
    flex: 1,
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
});

export default ChatTab;
