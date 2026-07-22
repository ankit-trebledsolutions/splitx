import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { dark, spacing } from '../theme';

// Bottom "muted text + link" row used under the primary button on every
// auth screen, e.g. "Remember your password? Back to Login".
const AuthFooter = ({ text, linkText, onPress, linkColor = dark.text }) => (
  <View style={styles.row}>
    <Text style={styles.text}>{text} </Text>
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[styles.link, { color: linkColor }]}>{linkText}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  text: { color: dark.textMuted, fontSize: 15 },
  link: { fontSize: 15, fontWeight: '700' },
});

export default AuthFooter;
