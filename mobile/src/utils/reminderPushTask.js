import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { applyReminderPush } from './reminderAlarms';

/**
 * Runs when a silent reminder push arrives, including while the app is closed:
 * Android starts the app's JavaScript in the background for a moment, this
 * task sets (or drops) the alarm, and the app goes back to sleep. It is how a
 * reminder someone else just created starts ringing on this phone without
 * the app being opened first.
 */
const TASK = 'splix-reminder-sync';

// A build from before expo-task-manager was added has no native half for it,
// and requiring the package there is a fatal red screen rather than an error
// that can be caught. So it is checked for first, as with the other optional
// native modules (see utils/saveToGallery.js).
const available = () => Boolean(requireOptionalNativeModule('ExpoTaskManager'));

// The data the server sent. Expo's push service hands it over as JSON text.
const dataOf = (payload) => {
  const carried = payload?.data;
  if (!carried) return null;
  const text = carried.dataString ?? carried.body;
  if (typeof text !== 'string') return text ?? carried;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Must run at the top level of index.js: when a push starts the app in the
 * background nothing is rendered, so only code that runs on import exists.
 */
export const defineReminderPushTask = () => {
  if (!available()) return;
  const TaskManager = require('expo-task-manager');
  if (TaskManager.isTaskDefined(TASK)) return;

  TaskManager.defineTask(TASK, async ({ data, error }) => {
    // A tap on a notification also lands here; only deliveries matter.
    if (error || !data || 'actionIdentifier' in data) return;
    try {
      await applyReminderPush(dataOf(data));
    } catch (err) {
      console.warn('Reminder push not applied:', err.message);
    }
  });
};

/**
 * Asks Android to hand silent pushes to the task above. Safe to repeat.
 *
 * Not in a development build. There the JavaScript comes from Metro, and a
 * push that arrives while the app is closed makes Android start it in the
 * background to fetch that bundle; Android cuts the download off, and the app
 * then opens on a blank screen until it is force-stopped. A release build
 * carries its bundle inside the APK and has no such problem. So in development
 * the task is left unregistered (and removed if an earlier build registered
 * it), and alarms are kept in step by the socket and by opening the app.
 */
export const registerReminderPushTask = async () => {
  if (!available()) return;
  try {
    if (__DEV__) await Notifications.unregisterTaskAsync(TASK);
    else await Notifications.registerTaskAsync(TASK);
  } catch (err) {
    // Unregistering a task that was never registered lands here too.
    if (!__DEV__) console.warn('Reminder push task not registered:', err.message);
  }
};
