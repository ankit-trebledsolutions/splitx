import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, dark, radius, spacing } from '../theme';

// Single labeled input used across the whole app.
//   variant: 'dark' (default, Figma auth styling) | 'light'
//   secure:  adds the eye visibility toggle
//   error:   shows a red border + message below the field
const TextField = ({
  label,
  error,
  secure = false,
  variant = 'dark',
  style,
  inputStyle,
  ...inputProps
}) => {
  const [hidden, setHidden] = useState(true);
  const isDark = variant === 'dark';
  const v = isDark ? darkStyles : lightStyles;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={v.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          style={[v.input, secure && styles.inputSecure, error && v.inputError, inputStyle]}
          placeholderTextColor={isDark ? dark.textMuted : colors.textMuted}
          secureTextEntry={secure && hidden}
          {...inputProps}
        />
        {secure && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setHidden((h) => !h)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={isDark ? dark.textMuted : colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={v.error}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  inputWrap: { position: 'relative' },
  inputSecure: { paddingRight: 48 },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});

const darkStyles = StyleSheet.create({
  label: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: 16,
    color: dark.text,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
});

const lightStyles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
});

export default TextField;
