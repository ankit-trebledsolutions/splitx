import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing, useStyles, useTheme } from '../theme';

// Compact "value over label" tile used across the Expenses / Tasks / Reminders
// tab headers.
const StatTile = ({ value, label, color, style }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.tile, style]}>
      <Text style={[styles.value, { color: color ?? theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  value: { fontSize: 18, fontWeight: '800' },
  label: { color: theme.textMuted, fontSize: 11, marginTop: 3 },
});

export default StatTile;
