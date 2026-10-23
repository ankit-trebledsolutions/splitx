import React from 'react';
import { View, TextInput, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, useStyles, useTheme } from '../theme';

const SearchField = ({ style, ...inputProps }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.wrapper, style]}>
      <Ionicons name="search" size={18} color={theme.textMuted} />
      <TextInput
        style={styles.input}
        placeholderTextColor={theme.textMuted}
        autoCorrect={false}
        {...inputProps}
      />
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    // Android TextInputs already carry vertical padding; iOS needs it added.
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  input: { flex: 1, color: theme.text, fontSize: 15, padding: 0 },
});

export default SearchField;
