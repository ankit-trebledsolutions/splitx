import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dark, radius, spacing } from '../theme';

const GradientButton = ({ title, onPress, loading = false, style }) => (
  <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.85} style={style}>
    <LinearGradient
      colors={[dark.accentBlue, dark.accentGreen]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.button}
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
  text: { color: '#04121C', fontSize: 17, fontWeight: '700' },
});

export default GradientButton;
