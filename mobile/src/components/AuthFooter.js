import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, useStyles, useTheme } from '../theme';

// Bottom "muted text + link" row used under the primary button on every
// auth screen, e.g. "Remember your password? Back to Login".
const AuthFooter = ({ text, linkText, onPress, linkColor }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{text} </Text>
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.link, { color: linkColor ?? theme.text }]}>{linkText}</Text>
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  text: { color: theme.textMuted, fontSize: 15 },
  link: { fontSize: 15, fontWeight: '700' },
});

export default AuthFooter;
