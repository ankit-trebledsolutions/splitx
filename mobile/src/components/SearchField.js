import React from 'react';
import { View, TextInput, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dark, radius, spacing } from '../theme';

const SearchField = ({ style, ...inputProps }) => (
  <View style={[styles.wrapper, style]}>
    <Ionicons name="search" size={18} color={dark.textMuted} />
    <TextInput
      style={styles.input}
      placeholderTextColor={dark.textMuted}
      autoCorrect={false}
      {...inputProps}
    />
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    // Android TextInputs already carry vertical padding; iOS needs it added.
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  input: { flex: 1, color: dark.text, fontSize: 15, padding: 0 },
});

export default SearchField;
