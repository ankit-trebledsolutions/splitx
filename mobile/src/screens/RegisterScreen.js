import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import TermsCheckbox from '../components/TermsCheckbox';
import AuthFooter from '../components/AuthFooter';
import GoogleIcon from '../assets/google.svg';
import { radius, spacing, useStyles, useTheme } from '../theme';
import AppAlert from '../components/AppAlert';
import { phoneError } from '../utils/profileValidation';

const RegisterScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { register, loginWithGoogle } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      AppAlert.alert('Missing details', 'Please fill in all fields.');
      return;
    }
    // Optional here; Complete Profile asks for it after sign-up if left blank.
    if (phone.trim() && phoneError(phone)) {
      AppAlert.alert('Invalid phone number', 'Please check the phone number, or leave it blank.');
      return;
    }
    if (password.length < 8) {
      AppAlert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPass) {
      AppAlert.alert('Passwords do not match', 'Both password fields must be identical.');
      return;
    }
    if (!agreed) {
      AppAlert.alert(
        'Terms required',
        'Please agree to the Terms of Service and Privacy Policy to continue.'
      );
      return;
    }
    setLoading(true);
    try {
      const sent = await register(name.trim(), email.trim(), password, phone.trim());
      navigation.navigate('EnterOtp', {
        email: sent.email,
        purpose: 'verify-email',
        retryAfter: sent.retryAfter,
        devOtp: sent.devOtp,
      });
    } catch (err) {
      AppAlert.alert('Registration failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Signing up with Google creates the account on the backend and logs in —
  // no form to fill, Google already verified the name and email.
  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (!err.cancelled) AppAlert.alert('Google sign-up failed', err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const busy = loading || googleLoading;

  return (
    <AuthLayout title="Create account" subtitle="Sign up to start splitting with Splix">
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoComplete="name"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="name@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Phone Number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+91 "
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secure
      />
      <TextField
        label="Confirm Password"
        value={confirmPass}
        onChangeText={setConfirmPass}
        placeholder="••••••••"
        secure
      />

      <TermsCheckbox checked={agreed} onToggle={() => setAgreed((v) => !v)} />

      <GradientButton
        title="Sign Up"
        onPress={handleRegister}
        loading={loading}
        style={styles.signUp}
      />

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or sign up with</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.googleButton, busy && styles.googleDisabled]}
        onPress={handleGoogle}
        disabled={busy}
        activeOpacity={0.8}
      >
        {googleLoading ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <>
            <GoogleIcon width={20} height={20} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <AuthFooter
        text="Already have an account?"
        linkText="Log In"
        onPress={() => navigation.goBack()}
      />
    </AuthLayout>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  signUp: { marginTop: spacing.md },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: { color: theme.textMuted, fontSize: 14 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  googleDisabled: { opacity: 0.6 },
  googleText: { color: theme.text, fontSize: 16, fontWeight: '600' },
});

export default RegisterScreen;
