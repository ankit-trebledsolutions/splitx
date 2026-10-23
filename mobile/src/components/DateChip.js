import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeSheetStyles } from './FormSheet';
import { useStyles, useTheme } from '../theme';

const defaultLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The date stepper of the create sheets: chevrons step a day either way, and
 * tapping the date itself opens the calendar (the parent puts a CalendarPanel
 * under it while `open`, the way the reminder sheet does).
 *
 *   <DateChip value={date} onChange={setDate} open={open} onToggle={() => setOpen(o => !o)} />
 */
const DateChip = ({ value, onChange, open, onToggle, label = defaultLabel, style }) => {
  const theme = useTheme();
  const sheetStyles = useStyles(makeSheetStyles);
  const shift = (days) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    onChange(next);
  };

  return (
    <View style={[sheetStyles.stepper, style, open && styles.open]}>
      <TouchableOpacity onPress={() => shift(-1)} style={sheetStyles.stepButton}>
        <Ionicons name="chevron-back" size={16} color={theme.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={sheetStyles.stepValue} onPress={onToggle} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={14} color={theme.accentGreen} />
        <Text style={sheetStyles.stepText}>{label(value)}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={theme.textMuted}
          style={styles.caret}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => shift(1)} style={sheetStyles.stepButton}>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  open: { borderColor: 'rgba(0,196,208,0.55)' },
  caret: { marginLeft: 2 },
});

export default DateChip;
