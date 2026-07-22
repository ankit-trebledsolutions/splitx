import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import SplixLogo from './SplixLogo';
import SplashGlow from '../assets/splash-glow.svg';
import { dark, spacing } from '../theme';

// Shared dark scaffold for the Splix auth screens: glow background (same
// asset as the splash screen), logo badge, heading + subtitle, scrollable body.
const AuthLayout = ({ title, subtitle, children }) => (
  <View style={styles.screen}>
    <SplashGlow
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    />
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
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
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
    marginTop: spacing.sm,
  },
  subtitle: {
    color: dark.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
});

export default AuthLayout;
