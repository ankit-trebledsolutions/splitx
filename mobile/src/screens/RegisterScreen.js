import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import DarkTextField from '../components/DarkTextField';
import GradientButton from '../components/GradientButton';
import { dark, radius, spacing } from '../theme';

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (err) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const socialComingSoon = (provider) =>
    Alert.alert(provider, `${provider} sign-up is coming soon.`);

  return (
    <AuthLayout title="Create account" subtitle="Sign up to start splitting with Splix">
      <DarkTextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoComplete="name"
      />
      <DarkTextField
        label="Email or Username"
        value={email}
        onChangeText={setEmail}
        placeholder="name@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <DarkTextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secure
      />

      <GradientButton
        title="Sign Up"
        onPress={handleRegister}
        loading={loading}
        style={styles.signUp}
      />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialRow}>
        <TouchableOpacity style={styles.socialButton} onPress={() => socialComingSoon('Google')}>
          <Ionicons name="logo-google" size={20} color={dark.text} />
          <Text style={styles.socialText}>Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton} onPress={() => socialComingSoon('Apple')}>
          <Ionicons name="logo-apple" size={22} color={dark.text} />
          <Text style={styles.socialText}>Apple</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.footerLink}>Log In</Text>
        </TouchableOpacity>
      </View>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  signUp: { marginTop: spacing.lg },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: dark.border },
  dividerText: { color: dark.textMuted, fontSize: 14 },
  socialRow: { flexDirection: 'row', gap: spacing.md },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  socialText: { color: dark.text, fontSize: 16, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  footerText: { color: dark.textMuted, fontSize: 15 },
  footerLink: { color: dark.link, fontSize: 15, fontWeight: '700' },
});

export default RegisterScreen;
