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
const DONE_COLOR = '#22C55E';
const STAY_COLOR = '#B79CFF';
const ATTRACTION_COLOR = '#F5B342';
const GALLERY_COLOR = '#2DD4BF';

const STAY_STATUS = {
  pending: { label: 'Pending', color: '#F5B342' },
  confirmed: { label: 'Confirmed', color: dark.accentGreen },
  cancelled: { label: 'Cancelled', color: '#F87171' },
};

const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const nightsBetween = (checkIn, checkOut) =>
  Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * People named on a card: the viewer as "you", the rest by name; first names
 * only when `short` (headings). "you & Asha", "Asha, Ben & 2 more".
 */
const peopleLabel = (users, currentUserId, { short = false } = {}) => {
  const people = users.filter(Boolean);
  const names = [
    ...(people.some((u) => u._id === currentUserId) ? ['you'] : []),
    ...people
      .filter((u) => u._id !== currentUserId)
      .map((u) => (short ? (u.name ?? '').trim().split(/\s+/)[0] : u.name) || 'a member'),
  ];
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
};
const capitalise = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : text);

// Activity cards are buttons as a whole: a tap opens what the card is about.
const CardShell = ({ accent, icon, label, onPress, children }) => {
  const Shell = onPress ? TouchableOpacity : View;
  return (
    <Shell style={styles.card} {...(onPress ? { onPress, activeOpacity: 0.8 } : {})}>
      <View style={[styles.cardHeader, { backgroundColor: `${accent}1F` }]}>
        <Ionicons name={icon} size={13} color={accent} />
        <Text style={[styles.cardHeaderText, { color: accent }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </Shell>
  );
};

// The "View ›" at the foot of a card. Not a button of its own: the card is.
const ViewLink = ({ label = 'View' }) => (
  <View style={styles.viewLink}>
    <Text style={styles.viewText}>{label}</Text>
    <Ionicons name="chevron-forward" size={13} color={dark.accentBlue} />
  </View>
);

/**
 * One row of the group chat. Text messages render as bubbles; everything added
 * to the group (expenses, tasks, reminders, stays, attractions, gallery
 * uploads, completed tasks) renders as an activity card referencing what it is
 * about, and tapping the card opens that.
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
  onOpenStay,
  onOpenAttraction,
  // (photo) a photo or video on a gallery card.
  onOpenMedia,
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
      <CardShell
        accent={dark.accentGreen}
        icon="cash-outline"
        label="EXPENSE ADDED"
        onPress={() => onOpenExpense?.(expense)}
      >
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
          <ViewLink />
        </View>
      </CardShell>
    );
  }

  if (type === 'task') {
    const task = message.task;
    if (!task) return wrapper(<Text style={styles.deleted}>This task was deleted</Text>);
    const accent = PRIORITY_COLOR[task.priority] ?? dark.accentBlue;
    // Who it was for when the card was posted. Cards from before that was
    // recorded only have the task's own list.
    const recorded = Array.isArray(message.assignees) ? message.assignees : task.assignees ?? [];
    const assignees = recorded.filter(Boolean);
    const forWhom = assignees.length
      ? ` FOR ${peopleLabel(assignees, currentUserId, { short: true }).toUpperCase()}`
      : '';

    return wrapper(
      <CardShell
        accent={accent}
        icon="checkbox-outline"
        label={`TASK ADDED${forWhom}`}
        onPress={() => onOpenTask?.(task)}
      >
        <Text style={styles.cardTitle}>{task.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>
            {task.dueAt ? `Due ${formatDateTime(task.dueAt)}` : 'No due date'}
          </Text>
          {assignees.length ? <MemberAvatars users={assignees} size={20} max={4} /> : null}
        </View>
        <ViewLink label="Open task" />
      </CardShell>
    );
  }

  if (type === 'task_done') {
    const task = message.task;
    if (!task) return wrapper(<Text style={styles.deleted}>This task was deleted</Text>);
    const assignees = (message.assignees ?? []).filter(Boolean);
    // The card's sender is whoever ticked it off.
    const doneBy = sender ? (isMine ? 'You' : sender.name) : 'A former member';

    return wrapper(
      <CardShell
        accent={DONE_COLOR}
        icon="checkmark-done-outline"
        label="TASK COMPLETED"
        onPress={() => onOpenTask?.(task)}
      >
        <View style={styles.doneTitleRow}>
          <Ionicons name="checkmark-circle" size={18} color={DONE_COLOR} />
          <Text style={[styles.cardTitle, styles.doneTitle]}>{task.title}</Text>
        </View>
        <View style={styles.personRow}>
          <Text style={styles.cardLabel}>Assigned to</Text>
          <Text style={styles.personValue} numberOfLines={2}>
            {assignees.length ? capitalise(peopleLabel(assignees, currentUserId)) : 'Unassigned'}
          </Text>
        </View>
        <View style={styles.personRow}>
          <Text style={styles.cardLabel}>Completed by</Text>
          <Text style={[styles.personValue, { color: DONE_COLOR }]} numberOfLines={1}>
            {doneBy}
          </Text>
        </View>
        <View style={[styles.cardFooter, styles.cardFooterEnd]}>
          <ViewLink label="Open task" />
        </View>
      </CardShell>
    );
  }

  if (type === 'reminder') {
    const reminder = message.reminder;
    if (!reminder) return wrapper(<Text style={styles.deleted}>This reminder was deleted</Text>);

    return wrapper(
      <CardShell
        accent={dark.accentBlue}
        icon="alarm-outline"
        label="REMINDER SET"
        onPress={() => onOpenReminders?.(reminder)}
      >
        <Text style={styles.cardTitle}>{reminder.title}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>{formatDateTime(reminder.remindAt)}</Text>
          <ViewLink />
        </View>
      </CardShell>
    );
  }

  if (type === 'stay') {
    const stay = message.stay;
    if (!stay) return wrapper(<Text style={styles.deleted}>This stay was deleted</Text>);
    const nights = nightsBetween(stay.checkIn, stay.checkOut);
    const status = STAY_STATUS[stay.status] ?? STAY_STATUS.pending;

    return wrapper(
      <CardShell accent={STAY_COLOR} icon="bed-outline" label="STAY ADDED" onPress={() => onOpenStay?.(stay)}>
        <View style={styles.entityRow}>
          <Text style={styles.entityEmoji}>{stay.emoji || '🏨'}</Text>
          <View style={styles.entityBody}>
            <Text style={styles.entityTitle} numberOfLines={2}>
              {stay.name}
            </Text>
            {stay.address ? (
              <Text style={styles.entityMeta} numberOfLines={1}>
                {stay.address}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>
            {shortDate(stay.checkIn)} → {shortDate(stay.checkOut)}
          </Text>
          <Text style={styles.cardValue}>{usd(nights * stay.pricePerNight)}</Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardFootnote}>
            {plural(nights, 'night')} · {plural(stay.guests ?? 1, 'guest')} ·{' '}
            <Text style={{ color: status.color }}>{status.label}</Text>
          </Text>
          <ViewLink label="View stay" />
        </View>
      </CardShell>
    );
  }

  if (type === 'attraction') {
    const attraction = message.attraction;
    if (!attraction) return wrapper(<Text style={styles.deleted}>This attraction was deleted</Text>);
    const meta = [
      attraction.category,
      attraction.rating != null ? `★ ${attraction.rating.toFixed(1)}` : null,
      attraction.distanceKm != null ? `${attraction.distanceKm} km away` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return wrapper(
      <CardShell
        accent={ATTRACTION_COLOR}
        icon="compass-outline"
        label="ATTRACTION ADDED"
        onPress={() => onOpenAttraction?.(attraction)}
      >
        <View style={styles.entityRow}>
          <Text style={styles.entityEmoji}>{attraction.emoji || '📍'}</Text>
          <View style={styles.entityBody}>
            <Text style={styles.entityTitle} numberOfLines={2}>
              {attraction.name}
            </Text>
            {meta ? (
              <Text style={styles.entityMeta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.cardFooter, styles.cardFooterEnd]}>
          <ViewLink />
        </View>
      </CardShell>
    );
  }

  if (type === 'gallery') {
    const items = (message.photos ?? []).filter(Boolean);
    if (!items.length) return wrapper(<Text style={styles.deleted}>These were deleted from the gallery</Text>);
    const videos = items.filter((item) => item.mediaType === 'video').length;
    const photos = items.length - videos;
    // "PHOTO ADDED" for one, "3 PHOTOS & 1 VIDEO ADDED" for more.
    const counted = (count, word) => (items.length === 1 ? word : plural(count, word));
    const added = [photos && counted(photos, 'photo'), videos && counted(videos, 'video')]
      .filter(Boolean)
      .join(' & ');
    const shown = items.slice(0, 4);
    const more = items.length - shown.length;
    const single = shown.length === 1;

    return wrapper(
      <CardShell
        accent={GALLERY_COLOR}
        icon={photos ? 'images-outline' : 'videocam-outline'}
        label={`${added} added`.toUpperCase()}
        onPress={() => onOpenMedia?.(items[0])}
      >
        <View style={styles.mediaGrid}>
          {shown.map((item, index) => {
            const isVideo = item.mediaType === 'video';
            // A video's picture is its poster frame; one sent without stays a plain tile.
            const thumb = absoluteUrl(item.thumbUrl || (isVideo ? '' : item.imageUrl));
            return (
              <TouchableOpacity
                key={item._id}
                style={[styles.mediaTile, single && styles.mediaTileSingle]}
                activeOpacity={0.85}
                onPress={() => onOpenMedia?.(item)}
              >
                {thumb ? (
                  <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Ionicons name={isVideo ? 'videocam' : 'image-outline'} size={22} color={dark.textMuted} />
                )}
                {isVideo && (
                  <View style={styles.mediaPlay} pointerEvents="none">
                    <Ionicons name="play" size={13} color="#FFFFFF" style={styles.mediaPlayIcon} />
                  </View>
                )}
                {isVideo && item.durationMs ? (
                  <Text style={styles.mediaDuration}>{formatDuration(item.durationMs)}</Text>
                ) : null}
                {index === shown.length - 1 && more > 0 && (
                  <View style={styles.mediaMore} pointerEvents="none">
                    <Text style={styles.mediaMoreText}>+{more}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={[styles.cardFooter, styles.cardFooterEnd]}>
          <ViewLink label="View in gallery" />
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
  cardHeaderText: { flexShrink: 1, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
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
  // Cards whose footer holds only the "View" link keep it on the right.
  cardFooterEnd: { justifyContent: 'flex-end' },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewText: { color: dark.accentBlue, fontSize: 12, fontWeight: '700' },
  deleted: { color: dark.textMuted, fontSize: 12, fontStyle: 'italic' },

  // "Task completed": the title with a tick, then who it was for and who did it.
  doneTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  doneTitle: { flexShrink: 1 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: 4,
  },
  personValue: {
    flexShrink: 1,
    textAlign: 'right',
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },

  // Stays and attractions: their emoji beside the name.
  entityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, marginBottom: spacing.sm },
  entityEmoji: { fontSize: 24 },
  entityBody: { flexShrink: 1 },
  entityTitle: { color: dark.text, fontSize: 15, fontWeight: '700' },
  entityMeta: { color: dark.textMuted, fontSize: 11, marginTop: 2 },

  // Gallery cards: up to four tiles, two to a row; a single one is larger.
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: 204 },
  mediaTile: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0B1116',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTileSingle: { width: 204, height: 204 },
  mediaPlay: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The triangle looks off-centre when centred exactly.
  mediaPlayIcon: { marginLeft: 2 },
  mediaDuration: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  mediaMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaMoreText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
});

// Memoised: a new message must not re-render every row already on screen.
export default React.memo(ChatMessage);
