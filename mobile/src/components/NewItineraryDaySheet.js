import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark } from '../theme';

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// Noon keeps the calendar day stable when the ISO string crosses time zones
// (the same rule DateField follows). Stepping a noon date by whole days keeps
// it at noon, so pinning the starting value is enough. A missing or unreadable
// value falls back to today.
const atNoon = (value) => {
  const given = value ? new Date(value) : null;
  const date = given && !Number.isNaN(given.getTime()) ? given : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
};

//   defaultDate: the calendar day this day number falls on (Date or ISO
//     string), worked out by the parent from the trip's dates. Today if absent.
const NewItineraryDaySheet = ({ visible, nextDayNumber = 1, defaultDate, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => atNoon(defaultDate));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset only when the sheet opens. `defaultDate` is left out of the deps on
  // purpose: the parent may build a new Date on every render, and resetting on
  // that would wipe the title while it is being typed.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDate(atNoon(defaultDate));
    setError('');
    setSaving(false);
  }, [visible]);

  const shiftDate = (days) => {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Give the day a title');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), date: date.toISOString() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={`Day ${nextDayNumber}`}
      subtitle="Add a day to the itinerary"
      submitLabel="Add Day"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Day Title</Text>
      <TextField
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (error) setError('');
        }}
        placeholder="e.g. Arrival Day"
        error={error || undefined}
      />

      <Text style={sheetStyles.label}>Date</Text>
      <View style={sheetStyles.stepper}>
        <TouchableOpacity onPress={() => shiftDate(-1)} style={sheetStyles.stepButton}>
          <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
        </TouchableOpacity>
        <View style={sheetStyles.stepValue}>
          <Ionicons name="calendar-outline" size={14} color={dark.accentGreen} />
          <Text style={sheetStyles.stepText}>{dateLabel(date)}</Text>
        </View>
        <TouchableOpacity onPress={() => shiftDate(1)} style={sheetStyles.stepButton}>
          <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
        </TouchableOpacity>
      </View>
    </FormSheet>
  );
};

export default NewItineraryDaySheet;
