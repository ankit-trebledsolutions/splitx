import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import GoogleIcon from '../assets/google.svg';
import { dark, radius, spacing } from '../theme';

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const socialComingSoon = (provider) =>
    Alert.alert(provider, `${provider} sign-in is coming soon.`);

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to access your splix">
      <TextField
        label="Email or Username"
        value={email}
        onChangeText={setEmail}
        placeholder="name@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secure
      />

      <TouchableOpacity
        style={styles.forgotWrap}
        onPress={() => navigation.navigate('ForgotPassword')}
      >
        <Text style={styles.forgotText}>Forgot Password?</Text>
      </TouchableOpacity>

      <GradientButton title="Log In" onPress={handleLogin} loading={loading} style={styles.loginBtn} />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialRow}>
        <TouchableOpacity
          style={styles.socialButton}
          onPress={() => socialComingSoon('Google')}
        >
          <GoogleIcon width={20} height={20} />
          <Text style={styles.socialText}>Google</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.socialButton}
          onPress={() => socialComingSoon('Apple')}
        >
          <Ionicons name="logo-apple" size={22} color={dark.text} />
          <Text style={styles.socialText}>Apple</Text>
        </TouchableOpacity>
      </View>

      <AuthFooter
        text="Don't have an account?"
        linkText="Sign Up"
        onPress={() => navigation.navigate('Register')}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  forgotWrap: { alignSelf: 'flex-end', marginBottom: spacing.lg },
  forgotText: { color: dark.textMuted, fontSize: 14, fontWeight: '600' },
  loginBtn: {marginTop: 85, marginBottom: 30},
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
});

export default LoginScreen;
