import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { minutesToLabel } from '../utils/time';
import { dark, radius, spacing } from '../theme';

const MINUTES_IN_DAY = 24 * 60;

/**
 * "‹ 10:00 AM ›" time picker in half-hour steps, with a close icon that takes
 * the time away again. The app ships no native time picker; this is the
 * chevron stepper from the New Reminder sheet, drawn as a form row.
 *   value: minutes since midnight. The text is always "h:mm AM/PM", whatever
 *          the phone's locale, because that is the shape the server expects.
 */
const TimeStepper = ({ label, value, onChange, onClear, step = 30, style }) => {
  // Stepping past midnight wraps round to the other end of the day.
  const shift = (delta) => onChange?.((value + delta + MINUTES_IN_DAY) % MINUTES_IN_DAY);

  return (
    <View style={[styles.row, style]}>
      <Ionicons name="time-outline" size={15} color={dark.accentGreen} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>

      <TouchableOpacity onPress={() => shift(-step)} hitSlop={styles.hitSlop} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={16} color={dark.textMuted} />
      </TouchableOpacity>
      <Text style={styles.value}>{minutesToLabel(value)}</Text>
      <TouchableOpacity onPress={() => shift(step)} hitSlop={styles.hitSlop} activeOpacity={0.7}>
        <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.clear}
        onPress={onClear}
        hitSlop={styles.hitSlop}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={16} color={dark.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  hitSlop: { top: 10, bottom: 10, left: 8, right: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  label: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '600' },
  // Fixed width, so the chevrons stay put as "9:30 AM" becomes "10:00 AM".
  value: {
    width: 76,
    color: dark.accentGreen,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  clear: { marginLeft: spacing.xs },
});

export default TimeStepper;
