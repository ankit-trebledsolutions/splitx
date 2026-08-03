import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dark, radius, spacing } from '../theme';

/**
 * Two designs:
 *  - default: flat #4A8CFF → #00E5A0 gradient, no glow
 *  - glow:    #00C4D0 → #00E5A0 gradient with a soft glow (e.g. "Save Task")
 */
const GradientButton = ({ title, onPress, loading = false, glow = false, style }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={loading}
    activeOpacity={0.85}
    style={[glow && styles.glow, style]}
  >
    <LinearGradient
      colors={glow ? dark.glowGradient : dark.gradient}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.button, glow && styles.buttonGlow]}
    >
      {loading ? (
        <ActivityIndicator color="#04121C" />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </LinearGradient>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGlow: { borderRadius: radius.lg + 4 },
  glow: {
    shadowColor: '#00E5A0',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  text: { color: '#04121C', fontSize: 17, fontWeight: '700' },
});

export default GradientButton;
