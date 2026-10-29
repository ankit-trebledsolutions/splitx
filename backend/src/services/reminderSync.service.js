const pushService = require('./push.service');

/**
 * Keeps the alarms on people's phones in step with the reminders stored here.
 *
 * A reminder rings from the phone's own alarm clock, so it works with the app
 * closed and with no signal. That means every phone has to be told ahead of
 * time. These are silent pushes: nothing is shown, the app wakes for a moment
 * and sets, moves or drops the alarm. The app also re-reads the whole list
 * whenever it is opened, so a push that never arrives corrects itself there.
 */
const TYPE = 'reminder-sync';

const send = (userIds, data) => {
  const ids = [...new Set(userIds.map(String))];
  // Not awaited by callers: like every push, it must not slow the request down.
  return pushService.sendToUsers(ids, { data: { type: TYPE, ...data } }, { silent: true });
};

// `reminder` is what a phone needs to set the alarm (alarmOf in reminder.service).
const upsert = (userIds, reminder) => send(userIds, { action: 'upsert', reminder });

const remove = (userIds, reminderId) =>
  send(userIds, { action: 'remove', reminderId: String(reminderId) });

// "Read the list again": for changes that touch many reminders at once, such
// as leaving a group or muting it.
const refresh = (userIds) => send(userIds, { action: 'refresh' });

module.exports = { TYPE, upsert, remove, refresh };
