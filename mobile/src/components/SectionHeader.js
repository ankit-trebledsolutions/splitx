import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';

// "Section title ............ Action ›" row used down the dashboard.
const SectionHeader = ({ title, actionLabel, actionIcon, onActionPress, style }) => (
  <View style={[styles.row, style]}>
    <Text style={styles.title}>{title}</Text>
    {actionLabel ? (
      <TouchableOpacity
        style={styles.action}
        onPress={onActionPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.actionText}>{actionLabel}</Text>
        {actionIcon ? <Ionicons name={actionIcon} size={14} color={dark.accentGreen} /> : null}
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { color: dark.text, fontSize: 17, fontWeight: '700' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: dark.accentGreen, fontSize: 13, fontWeight: '600' },
});

export default SectionHeader;
