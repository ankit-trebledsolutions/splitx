import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius, spacing, useStyles } from '../theme';

// "−  value  +" counter used for the trip length on Create Group.
const StepperField = ({ label, value, onChange, min = 1, max = 365, style }) => {
  const styles = useStyles(makeStyles);
  const step = (delta) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange?.(next);
  };

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.field}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => step(-1)}
          disabled={value <= min}
          activeOpacity={0.7}
        >
          <Text style={[styles.sign, value <= min && styles.signDisabled]}>−</Text>
        </TouchableOpacity>

        <Text style={styles.value}>{value}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => step(1)}
          disabled={value >= max}
          activeOpacity={0.7}
        >
          <Text style={[styles.sign, value >= max && styles.signDisabled]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  button: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  sign: { color: theme.text, fontSize: 22, fontWeight: '500' },
  signDisabled: { color: theme.textMuted, opacity: 0.5 },
  value: { color: theme.text, fontSize: 17, fontWeight: '600' },
});

export default StepperField;
