import { useCallback, useState } from 'react';
import AppAlert from '../components/AppAlert';
import { ensureAlarmPermissions } from '../components/AlarmPermissionSheet';
import { createReminder, updateReminder, deleteReminder } from '../api/reminders.api';
import { syncReminderAlarms } from '../utils/reminderAlarms';

const idOf = (value) => String(value?._id ?? value);

/**
 * Creating, editing, switching and deleting reminders: shared by a group's
 * Reminders tab and the "Reminders" screen that lists them all. Every change
 * is followed by a sync, so the phone's alarms match what was just saved.
 *
 *   groupId       where a new reminder goes; null makes it a personal one
 *   userId        the signed-in person
 *   adminId       the group's admin, who may delete any of its reminders
 *   setReminders  the screen's list setter
 *   onCreated     called with a reminder that was just created
 *
 * Spread `sheetProps` onto <ReminderSheet />.
 */
const useReminderActions = ({ groupId = null, userId, adminId, setReminders, onCreated }) => {
  // null: closed. { reminder }: editing it. { seed }: creating, starting from the seed.
  const [sheet, setSheet] = useState(null);

  const openNew = useCallback((seed = {}) => setSheet({ seed }), []);
  const openEdit = useCallback((reminder) => setSheet({ reminder }), []);
  const close = useCallback(() => setSheet(null), []);

  const replace = (next) =>
    setReminders((prev) => prev.map((r) => (r._id === next._id ? next : r)));

  const submit = async (payload) => {
    const editing = sheet?.reminder;
    try {
      if (editing) {
        replace(await updateReminder(editing._id, payload));
      } else {
        const created = await createReminder(groupId, {
          ...payload,
          icon: 'alarm-outline',
          ...(sheet?.seed?.taskId ? { task: sheet.seed.taskId } : {}),
        });
        setReminders((prev) => [...prev, created]);
        onCreated?.(created);
      }
      setSheet(null);
      syncReminderAlarms();
      // Asked for now if still missing. The reminder is saved either way; this
      // only decides whether it rings or arrives as a plain notification.
      ensureAlarmPermissions();
    } catch (err) {
      AppAlert.alert(editing ? 'Could not update reminder' : 'Could not set reminder', err.message);
    }
  };

  const remove = (reminder) => {
    AppAlert.alert(
      'Delete reminder?',
      reminder.scope === 'group'
        ? `"${reminder.title}" will be removed for everyone in the group.`
        : `"${reminder.title}" will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReminder(reminder._id);
              setReminders((prev) => prev.filter((r) => r._id !== reminder._id));
              setSheet(null);
              syncReminderAlarms();
            } catch (err) {
              AppAlert.alert('Could not delete reminder', err.message);
            }
          },
        },
      ]
    );
  };

  /**
   * The switch on a reminder is the person's own: off silences it on their
   * phone and leaves it ringing for everyone else.
   */
  const toggle = async (reminder) => {
    const on = reminder.enabled && !reminder.muted;
    // A server from before per-person switches only knows on/off for everybody.
    const legacy = reminder.muted === undefined;
    const change = legacy
      ? { enabled: !reminder.enabled }
      : on
        ? { muted: true }
        : { muted: false, ...(reminder.enabled ? {} : { enabled: true }) };

    replace({ ...reminder, ...change });
    try {
      replace(await updateReminder(reminder._id, change));
      syncReminderAlarms();
      if (!on) ensureAlarmPermissions();
    } catch (err) {
      replace(reminder); // roll back
      AppAlert.alert('Could not update reminder', err.message);
    }
  };

  const editing = sheet?.reminder;
  const mine = editing ? idOf(editing.createdBy) === String(userId) : true;
  const canDelete = editing && (mine || (adminId && String(adminId) === String(userId)));

  const sheetProps = {
    visible: Boolean(sheet),
    reminder: editing,
    seed: sheet?.seed,
    personal: editing ? !editing.group : !groupId,
    canChangeScope: mine,
    onClose: close,
    onSubmit: submit,
    onDelete: canDelete ? () => remove(editing) : undefined,
  };

  return { openNew, openEdit, toggle, sheetProps };
};

export default useReminderActions;
