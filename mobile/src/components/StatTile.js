import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { dark, radius, spacing } from '../theme';

// Compact "value over label" tile used across the Expenses / Tasks / Reminders
// tab headers.
const StatTile = ({ value, label, color = dark.text, style }) => (
  <View style={[styles.tile, style]}>
    <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    <Text style={styles.label}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  value: { fontSize: 18, fontWeight: '800' },
  label: { color: dark.textMuted, fontSize: 11, marginTop: 3 },
});

export default StatTile;
