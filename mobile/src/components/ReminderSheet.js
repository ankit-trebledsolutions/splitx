import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import CalendarPanel from './CalendarPanel';
import TimeWheel from './TimeWheel';
import { dark, radius, spacing } from '../theme';
import { formatTime } from '../utils/format';
import { alarmsSupported, nextRingAt } from '../utils/reminderAlarms';

const DANGER = '#F97362';

// Tomorrow at 10:00 AM by default.
const defaultRemindAt = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date;
};

// An alarm rings on the minute, so seconds are dropped from whatever comes in.
const onTheMinute = (value) => {
  const date = new Date(value);
  date.setSeconds(0, 0);
  return date;
};

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// The middle of the date or time chip. Tapping it drops the picker down.
const StepValue = ({ icon, text, open, onPress }) => (
  <TouchableOpacity style={sheetStyles.stepValue} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon} size={14} color={dark.accentGreen} />
    <Text style={sheetStyles.stepText}>{text}</Text>
    <Ionicons
      name={open ? 'chevron-up' : 'chevron-down'}
      size={12}
      color={dark.textMuted}
      style={styles.stepCaret}
    />
  </TouchableOpacity>
);

/**
 * The reminder sheet, per the add-reminder design. It creates a reminder and
 * edits one:
 *
 *   reminder        the one being edited (the sheet then says "Edit Reminder")
 *   seed            what a new one starts from: { title, subtitle, remindAt }
 *   personal        it belongs to no group, so there is nobody else to remind
 *   canChangeScope  only the person who made a reminder decides who it is for
 *   onDelete        shows "Delete reminder"
 *
 * The date and time chips step by a day or half an hour with their chevrons;
 * tapping the middle of one drops a calendar, or the time wheels, down under
 * them to set it exactly.
 *
 * onSubmit receives only what should be saved; when editing, the time is left
 * out unless it was changed, so renaming an old reminder does not move it.
 */
const ReminderSheet = ({
  visible,
  reminder,
  seed,
  personal = false,
  canChangeScope = true,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const editing = Boolean(reminder);

  const [title, setTitle] = useState('');
  const [remindAt, setRemindAt] = useState(defaultRemindAt);
  const [startedAt, setStartedAt] = useState(0);
  // Which picker is dropped down: 'date', 'time' or null.
  const [picker, setPicker] = useState(null);
  const [scope, setScope] = useState('group');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const from = reminder ?? seed ?? {};
    // A weekly reminder is edited at its next turn, not at a date already gone.
    const at = reminder ? nextRingAt(reminder) ?? reminder.remindAt : from.remindAt;
    const start = at ? onTheMinute(at) : defaultRemindAt();
    setTitle(from.title ?? '');
    setRemindAt(start);
    setStartedAt(start.getTime());
    setPicker(null);
    setScope(from.scope ?? 'group');
    setRepeatWeekly(from.repeatWeekly ?? false);
    setNotes(from.subtitle ?? '');
    setError('');
    setTimeError('');
    setSaving(false);
  }, [visible, reminder, seed]);

  const timeChanged = !editing || remindAt.getTime() !== startedAt;

  const change = (next) => {
    setRemindAt(next);
    if (timeError) setTimeError('');
  };

  const shiftDate = (days) => {
    const next = new Date(remindAt);
    next.setDate(next.getDate() + days);
    change(next);
  };

  const shiftTime = (minutes) => {
    const next = new Date(remindAt);
    next.setMinutes(next.getMinutes() + minutes);
    change(next);
  };

  const toggle = (which) => setPicker((current) => (current === which ? null : which));

  // Under the chips: a nudge, or that the time has gone. An old reminder
  // being renamed keeps its old time, which is not a mistake.
  const past = remindAt.getTime() <= Date.now();
  const whenHint =
    timeError ||
    (past
      ? timeChanged
        ? 'That time has already passed. Pick a later one.'
        : 'Already rang. Pick a new time to ring again.'
      : 'Tap the date or the time to set it exactly.');
  const whenHintIsError = Boolean(timeError) || (past && timeChanged);

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('What should we remind you about?');
      return;
    }
    if (timeChanged && remindAt.getTime() <= Date.now()) {
      setTimeError('That time has already passed. Pick a later one.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        // When editing, an emptied note has to be sent to be cleared.
        subtitle: notes.trim() || (editing ? '' : undefined),
        ...(timeChanged ? { remindAt: remindAt.toISOString() } : {}),
        ...(personal || !canChangeScope ? {} : { scope }),
        repeatWeekly,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={editing ? 'Edit Reminder' : 'New Reminder'}
      subtitle={
        alarmsSupported
          ? 'Rings like an alarm, even when Splix is closed'
          : 'Never miss what matters on this trip'
      }
      submitLabel={editing ? 'Save Changes' : 'Save Reminder'}
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>What is this for?</Text>
      <View style={styles.titleWrap}>
        <TextField
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            if (error) setError('');
          }}
          placeholder="e.g. Buy Shibuya Sky tickets"
          error={error || undefined}
          maxLength={200}
          inputStyle={styles.titleInput}
        />
        {title.trim().length >= 2 && (
          <Ionicons
            name="checkmark-circle-outline"
            size={18}
            color={dark.accentGreen}
            style={styles.titleCheck}
          />
        )}
      </View>

      <View style={[sheetStyles.row, styles.whenRow]}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Date</Text>
          <View
            style={[sheetStyles.stepper, styles.stepperTight, picker === 'date' && styles.stepperOpen]}
          >
            <TouchableOpacity onPress={() => shiftDate(-1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <StepValue
              icon="calendar-outline"
              text={dateLabel(remindAt)}
              open={picker === 'date'}
              onPress={() => toggle('date')}
            />
            <TouchableOpacity onPress={() => shiftDate(1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.half}>
          <Text style={sheetStyles.label}>Time</Text>
          <View
            style={[sheetStyles.stepper, styles.stepperTight, picker === 'time' && styles.stepperOpen]}
          >
            <TouchableOpacity onPress={() => shiftTime(-30)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <StepValue
              icon="time-outline"
              text={formatTime(remindAt)}
              open={picker === 'time'}
              onPress={() => toggle('time')}
            />
            <TouchableOpacity onPress={() => shiftTime(30)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {picker === 'date' ? (
        <CalendarPanel value={remindAt} onChange={change} onDone={() => setPicker(null)} />
      ) : null}
      {picker === 'time' ? (
        <TimeWheel value={remindAt} onChange={change} onDone={() => setPicker(null)} />
      ) : null}

      <Text style={[styles.whenHint, whenHintIsError && styles.whenError]}>{whenHint}</Text>

      {personal ? null : (
        <>
          <Text style={sheetStyles.label}>Who should be reminded?</Text>
          <View style={[styles.segment, !canChangeScope && styles.segmentLocked]}>
            {[
              { value: 'group', label: 'Everyone', icon: 'people-outline' },
              { value: 'me', label: 'Just Me', icon: 'person-outline' },
            ].map((option) => {
              const active = scope === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  activeOpacity={0.8}
                  disabled={!canChangeScope}
                  onPress={() => setScope(option.value)}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={active ? dark.text : dark.textMuted}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.repeatRow}>
        <View style={styles.repeatBody}>
          <Text style={styles.repeatTitle}>Repeat Reminder</Text>
          <Text style={styles.repeatMeta}>
            {personal ? 'Repeat every week' : 'Repeat weekly until trip ends'}
          </Text>
        </View>
        <Switch
          value={repeatWeekly}
          onValueChange={setRepeatWeekly}
          trackColor={{ false: 'rgba(255,255,255,0.14)', true: dark.accentGreen }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="rgba(255,255,255,0.14)"
        />
      </View>

      <Text style={sheetStyles.label}>Notes (Optional)</Text>
      <TextField
        value={notes}
        onChangeText={setNotes}
        placeholder="Remember to reserve the slot exactly 30 days prior. Tickets sell out in minutes!"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={200}
        inputStyle={styles.notesInput}
      />

      {onDelete ? (
        <TouchableOpacity style={styles.delete} onPress={onDelete} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={15} color={DANGER} />
          <Text style={styles.deleteText}>Delete reminder</Text>
        </TouchableOpacity>
      ) : null}
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  titleWrap: { position: 'relative' },
  titleInput: { paddingRight: 44 },
  titleCheck: { position: 'absolute', right: spacing.md, top: 15 },
  half: { flex: 1 },
  stepperTight: { marginBottom: 0 },
  stepperOpen: { borderColor: 'rgba(0,196,208,0.55)' },
  stepCaret: { marginLeft: 2 },
  whenRow: { marginBottom: spacing.sm },
  whenHint: { color: dark.textMuted, fontSize: 11, marginBottom: spacing.md },
  whenError: { color: DANGER },

  segment: {
    flexDirection: 'row',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md + 2,
    padding: 3,
    marginBottom: spacing.md,
  },
  segmentLocked: { opacity: 0.55 },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md - 2,
    paddingVertical: spacing.sm + 2,
  },
  segmentItemActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  segmentText: { color: dark.textMuted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: dark.text },

  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  repeatBody: { flex: 1 },
  repeatTitle: { color: dark.text, fontSize: 14, fontWeight: '700' },
  repeatMeta: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  notesInput: { minHeight: 96, paddingTop: spacing.md - 2 },

  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(249,115,98,0.35)',
    backgroundColor: 'rgba(249,115,98,0.08)',
    borderRadius: radius.md,
    paddingVertical: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  deleteText: { color: DANGER, fontSize: 14, fontWeight: '700' },
});

export default ReminderSheet;
