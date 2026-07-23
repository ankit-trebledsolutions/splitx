import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, spacing } from '../theme';

// Back chevron on the left, optional title, optional action icon on the right.
const ScreenHeader = ({ title, onBack, rightIcon, onRightPress }) => (
  <View style={styles.row}>
    {onBack ? (
      <TouchableOpacity style={styles.iconButton} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={22} color={dark.text} />
      </TouchableOpacity>
    ) : (
      <View style={styles.iconButton} />
    )}

    <Text style={styles.title} numberOfLines={1}>
      {title || ''}
    </Text>

    {rightIcon ? (
      <TouchableOpacity style={styles.iconButton} onPress={onRightPress} activeOpacity={0.7}>
        <Ionicons name={rightIcon} size={22} color={dark.text} />
      </TouchableOpacity>
    ) : (
      <View style={styles.iconButton} />
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ScreenHeader;
