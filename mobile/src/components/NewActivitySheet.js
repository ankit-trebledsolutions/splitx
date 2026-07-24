import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormSheet, { sheetStyles } from './FormSheet';
import TextField from './TextField';
import { dark } from '../theme';
import { formatTime } from '../utils/format';

const defaultTime = () => {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return date;
};

// Adds one activity to an itinerary day.
const NewActivitySheet = ({ visible, day, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState(defaultTime);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setTime(defaultTime());
    setError('');
    setSaving(false);
  }, [visible]);

  const shiftTime = (minutes) => {
    setTime((prev) => {
      const next = new Date(prev);
      next.setMinutes(next.getMinutes() + minutes);
      return next;
    });
  };

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Give the activity a title');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), time: formatTime(time) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title="New Activity"
      subtitle={day ? `Day ${day.dayNumber} · ${day.title}` : undefined}
      submitLabel="Add Activity"
      saving={saving}
      onClose={onClose}
      onSubmit={submit}
    >
      <Text style={sheetStyles.label}>Activity</Text>
      <TextField
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (error) setError('');
        }}
        placeholder="e.g. Visit Senso-ji Temple"
        error={error || undefined}
      />

      <Text style={sheetStyles.label}>Time</Text>
      <View style={sheetStyles.stepper}>
        <TouchableOpacity onPress={() => shiftTime(-30)} style={sheetStyles.stepButton}>
          <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
        </TouchableOpacity>
        <View style={sheetStyles.stepValue}>
          <Ionicons name="time-outline" size={14} color={dark.accentGreen} />
          <Text style={sheetStyles.stepText}>{formatTime(time)}</Text>
        </View>
        <TouchableOpacity onPress={() => shiftTime(30)} style={sheetStyles.stepButton}>
          <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
        </TouchableOpacity>
      </View>
    </FormSheet>
  );
};

export default NewActivitySheet;
