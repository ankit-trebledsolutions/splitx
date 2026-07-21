import React from 'react';
import {
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import SplixLogo from './SplixLogo';
import { dark, spacing } from '../theme';

// Shared dark scaffold for the Splix auth screens: gradient background,
// logo badge, heading + subtitle, scrollable body.
const AuthLayout = ({ title, subtitle, children }) => (
  <LinearGradient
    colors={[dark.backgroundAlt, dark.background]}
    start={{ x: 0.2, y: 0 }}
    end={{ x: 0.8, y: 1 }}
    style={styles.gradient}
  >
    <StatusBar style="light" />
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SplixLogo size={64} />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </LinearGradient>
);

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    color: dark.text,
    fontSize: 34,
    fontWeight: '800',
    marginTop: spacing.lg,
  },
  subtitle: {
    color: dark.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
});

export default AuthLayout;
