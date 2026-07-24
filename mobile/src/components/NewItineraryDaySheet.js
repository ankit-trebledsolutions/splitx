import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark } from '../theme';

const dateLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const NewItineraryDaySheet = ({ visible, nextDayNumber = 1, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDate(new Date());
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
