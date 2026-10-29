import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DarkScreen from './DarkScreen';
import { radius, spacing, useStyles, useTheme } from '../theme';

// Stand-in for the tabs that are not built yet.
const PlaceholderScreen = ({ title, subtitle, icon = 'construct-outline' }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <DarkScreen>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={28} color={theme.textMuted} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </DarkScreen>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: theme.text, fontSize: 22, fontWeight: '700' },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default PlaceholderScreen;
