import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark, radius, spacing } from '../theme';
import { formatTime } from '../utils/format';

// Tomorrow at 10:00 AM by default.
const defaultRemindAt = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date;
};

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// "New Reminder" sheet per the add-reminder design.
const NewReminderSheet = ({ visible, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [remindAt, setRemindAt] = useState(defaultRemindAt);
  const [scope, setScope] = useState('group');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setRemindAt(defaultRemindAt());
    setScope('group');
    setRepeatWeekly(false);
    setNotes('');
    setError('');
    setSaving(false);
  }, [visible]);

  const shiftDate = (days) => {
    setRemindAt((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const shiftTime = (minutes) => {
    setRemindAt((prev) => {
      const next = new Date(prev);
      next.setMinutes(next.getMinutes() + minutes);
      return next;
    });
  };

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('What should we remind you about?');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        subtitle: notes.trim() || undefined,
        remindAt: remindAt.toISOString(),
        scope,
        repeatWeekly,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="New Reminder"
      subtitle="Never miss what matters on this trip"
      submitLabel="Save Reminder"
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

      <View style={sheetStyles.row}>
        <View style={styles.half}>
          <Text style={sheetStyles.label}>Date</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity onPress={() => shiftDate(-1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="calendar-outline" size={14} color={dark.accentGreen} />
              <Text style={sheetStyles.stepText}>{dateLabel(remindAt)}</Text>
            </View>
            <TouchableOpacity onPress={() => shiftDate(1)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.half}>
          <Text style={sheetStyles.label}>Time</Text>
          <View style={[sheetStyles.stepper, styles.stepperTight]}>
            <TouchableOpacity onPress={() => shiftTime(-30)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
            </TouchableOpacity>
            <View style={sheetStyles.stepValue}>
              <Ionicons name="time-outline" size={14} color={dark.accentGreen} />
              <Text style={sheetStyles.stepText}>{formatTime(remindAt)}</Text>
            </View>
            <TouchableOpacity onPress={() => shiftTime(30)} style={sheetStyles.stepButton}>
              <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={sheetStyles.label}>Who should be reminded?</Text>
      <View style={styles.segment}>
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

      <View style={styles.repeatRow}>
        <View style={styles.repeatBody}>
          <Text style={styles.repeatTitle}>Repeat Reminder</Text>
          <Text style={styles.repeatMeta}>Repeat weekly until trip ends</Text>
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
        inputStyle={styles.notesInput}
      />
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  titleWrap: { position: 'relative' },
  titleInput: { paddingRight: 44 },
  titleCheck: { position: 'absolute', right: spacing.md, top: 15 },
  half: { flex: 1 },
  stepperTight: { marginBottom: 0 },

  segment: {
    flexDirection: 'row',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md + 2,
    padding: 3,
    marginBottom: spacing.md,
  },
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
});

export default NewReminderSheet;
