import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

const Button = ({ title, onPress, loading = false, variant = 'primary', style }) => (
  <TouchableOpacity
    style={[styles.base, styles[variant], loading && styles.disabled, style]}
    onPress={onPress}
    disabled={loading}
    activeOpacity={0.8}
  >
    {loading ? (
      <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
    ) : (
      <Text style={[styles.text, variant === 'outline' && styles.textOutline]}>{title}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md - 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.7 },
  text: { color: '#fff', fontWeight: '600', fontSize: 16 },
  textOutline: { color: colors.primary },
});

export default Button;
