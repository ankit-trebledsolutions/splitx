import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import SplixAlarm from '../../modules/splix-alarm';
import { TOKEN_KEY } from '../api/client';
import { fetchMyReminders, markRemindersArmed } from '../api/reminders.api';

/**
 * Reminders that ring like an alarm.
 *
 * The alarm is set on the phone itself (modules/splix-alarm), so it rings at
 * the exact minute with the app closed, the phone locked, or no signal. This
 * file keeps the phone's alarms in step with the reminders on the server:
 *
 *  - the whole list is re-read whenever the app opens or something changes;
 *  - a silent push from the server sets, moves or drops one alarm while the
 *    app is closed (see reminderPushTask.js).
 *
 * iOS, and an Android build from before the alarm module existed, have no
 * alarm clock to hand reminders to. There they are scheduled as ordinary
 * notifications instead: no ringing screen, but they still arrive on time.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// A file in modules/splix-alarm/android/src/main/res/raw. When groups can pick
// their own sound, this is where the group's choice goes.
const DEFAULT_SOUND = 'splix_alarm';
const FALLBACK_PREFIX = 'splix-reminder-';
// iOS keeps at most 64 pending notifications per app; leave room for others.
const FALLBACK_LIMIT = 40;

// True when this build can ring a reminder as a real alarm.
export const alarmsSupported = Boolean(SplixAlarm);

/**
 * When a reminder next rings, in epoch ms: its own time while that is ahead,
 * else its next weekly turn. Null once there is nothing left to ring.
 */
export const nextRingAt = (reminder, now = Date.now()) => {
  const at = new Date(reminder.remindAt).getTime();
  if (at > now) return at;
  if (!reminder.repeatWeekly) return null;
  const next = at + (Math.floor((now - at) / WEEK_MS) + 1) * WEEK_MS;
  const until = reminder.repeatUntil ? new Date(reminder.repeatUntil).getTime() : 0;
  return until && next > until ? null : next;
};

// A reminder (from the API or from a sync push) as the alarm the phone holds.
const toAlarm = (reminder) => ({
  id: String(reminder._id),
  fireAt: new Date(reminder.remindAt).getTime(),
  title: reminder.title,
  body: reminder.subtitle || '',
  groupId: reminder.group ? String(reminder.group) : null,
  groupName: reminder.groupName ?? null,
  taskId: reminder.task ? String(reminder.task) : null,
  sound: DEFAULT_SOUND,
  repeatMs: reminder.repeatWeekly ? WEEK_MS : 0,
  repeatUntil: reminder.repeatUntil ? new Date(reminder.repeatUntil).getTime() : 0,
});

const signedIn = async () => Boolean(await AsyncStorage.getItem(TOKEN_KEY));

// ---- Without the alarm module: plain scheduled notifications ---------------

const cancelFallbackNotifications = async () => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(FALLBACK_PREFIX))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier))
  );
};

// Resolves to the ids of the reminders that now have a notification waiting.
const scheduleFallbackNotifications = async (reminders) => {
  await cancelFallbackNotifications();
  const upcoming = reminders
    .map((reminder) => ({ reminder, at: nextRingAt(reminder) }))
    .filter((entry) => entry.at)
    .sort((a, b) => a.at - b.at)
    .slice(0, FALLBACK_LIMIT);

  for (const { reminder, at } of upcoming) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${FALLBACK_PREFIX}${reminder._id}`,
      content: {
        title: reminder.title,
        body: reminder.subtitle || reminder.groupName || 'Reminder',
        sound: 'default',
        // The same shape a push carries, so a tap is routed the same way.
        data: {
          type: 'reminder',
          ...(reminder.group ? { groupId: String(reminder.group) } : {}),
          ...(reminder.task ? { entityId: String(reminder.task) } : {}),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: 'default',
      },
    });
  }
  return upcoming.map(({ reminder }) => String(reminder._id));
};

// ---- Keeping the phone in step with the server -----------------------------

// Bumped on sign-out. A sync that was already under way when the person signed
// out must not put their alarms back afterwards.
let epoch = 0;

const syncOnce = async () => {
  const startedIn = epoch;
  if (!(await signedIn())) return;

  let reminders;
  try {
    reminders = await fetchMyReminders();
  } catch {
    // Offline, or a server from before this existed: what is already set stays set.
    return;
  }
  if (startedIn !== epoch || !(await signedIn())) return;

  // The server says which ones ring on this person's phone: not the ones they
  // switched off, nor other people's in a group they muted.
  const ringing = reminders.filter((reminder) => reminder.rings);

  const armed = SplixAlarm
    ? await SplixAlarm.sync(ringing.map(toAlarm))
    : await scheduleFallbackNotifications(ringing);
  // Tells the server this phone has them, so its backup push at reminder time
  // goes only to people whose phone does not. Best-effort.
  if (armed.length) markRemindersArmed(armed).catch(() => {});
};

let running = null;
let again = false;

/**
 * Re-reads my reminders and makes the phone's alarms match. Safe to call as
 * often as anything changes: calls that arrive while one is in flight are
 * folded into a single follow-up run.
 */
export const syncReminderAlarms = () => {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } catch (err) {
      console.warn('Reminder alarms not synced:', err.message);
    } finally {
      running = null;
    }
  })();
  return running;
};

// Signing out: nothing may ring for whoever uses this phone next.
export const clearReminderAlarms = async () => {
  epoch += 1;
  try {
    if (SplixAlarm) await SplixAlarm.clear();
    else await cancelFallbackNotifications();
  } catch (err) {
    console.warn('Reminder alarms not cleared:', err.message);
  }
};

/**
 * A silent push from the server (backend reminderSync.service): set or move
 * one alarm, drop one, or read the whole list again. Runs with the app closed.
 */
export const applyReminderPush = async (data) => {
  if (data?.type !== 'reminder-sync') return;
  // A push that was already on its way when the person signed out.
  if (!(await signedIn())) return;

  if (!SplixAlarm || data.action === 'refresh') {
    await syncReminderAlarms();
  } else if (data.action === 'upsert' && data.reminder) {
    const waiting = await SplixAlarm.upsert(toAlarm(data.reminder));
    if (waiting) markRemindersArmed([String(data.reminder._id)]).catch(() => {});
  } else if (data.action === 'remove' && data.reminderId) {
    await SplixAlarm.remove(String(data.reminderId));
  }
};

// ---- Permissions -----------------------------------------------------------

/**
 * What the phone allows right now.
 *
 *  notifications  the alarm can be shown at all
 *  exactAlarm     it rings on the minute ("Alarms & reminders" in Android settings)
 *  fullScreen     the alarm screen can appear over the lock screen
 *  complete       nothing is missing
 *
 * The "...IsSetting" flags say whether that permission is a switch the person
 * can change on this Android version; where it is not, it is always granted.
 */
export const getAlarmPermissions = async () => {
  const notifications = await Notifications.getPermissionsAsync();
  if (!SplixAlarm) {
    return {
      alarms: false,
      notifications: notifications.granted,
      canAskNotifications: notifications.canAskAgain,
      exactAlarm: true,
      exactAlarmIsSetting: false,
      fullScreen: true,
      fullScreenIsSetting: false,
      complete: notifications.granted,
    };
  }
  const native = SplixAlarm.getPermissions();
  return {
    alarms: true,
    ...native,
    canAskNotifications: notifications.canAskAgain,
    complete: native.notifications && native.exactAlarm && native.fullScreen,
  };
};

// kind: 'exactAlarm' | 'fullScreen' | 'notifications' | 'app'
export const openAlarmSettings = (kind) => SplixAlarm?.openSettings(kind);

// ---- Opening the app from an alarm -----------------------------------------

/**
 * Where an alarm asked the app to go ("Open in Splix" on the alarm screen, or
 * a tap on a missed reminder), as [screen, params]. Handed over once.
 */
export const takeAlarmRoute = () => {
  const alarm = SplixAlarm?.takeOpen();
  if (!alarm) return null;
  if (alarm.taskId) return ['TaskDetail', { taskId: alarm.taskId }];
  if (alarm.groupId) return ['GroupChat', { groupId: alarm.groupId, initialTab: 'reminders' }];
  return ['Reminders'];
};

/**
 * The app was opened while an alarm is ringing: put the alarm screen in front,
 * so there is always somewhere to answer it from.
 */
export const showRingingAlarm = () => {
  if (SplixAlarm?.getRinging()) SplixAlarm.showRinging().catch(() => {});
};

// type: 'fired' | 'stopped' | 'open'. Returns the subscription (or a no-op one).
export const addAlarmListener = (listener) =>
  SplixAlarm ? SplixAlarm.addListener('onAlarmEvent', listener) : { remove: () => {} };
