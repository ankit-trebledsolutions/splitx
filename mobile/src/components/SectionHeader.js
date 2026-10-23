import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useStyles, useTheme } from '../theme';

// "Section title ............ Action ›" row used down the dashboard.
const SectionHeader = ({ title, actionLabel, actionIcon, onActionPress, style }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
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
          {actionIcon ? <Ionicons name={actionIcon} size={14} color={theme.accentGreen} /> : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '700' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: theme.accentGreen, fontSize: 13, fontWeight: '600' },
});

export default SectionHeader;
