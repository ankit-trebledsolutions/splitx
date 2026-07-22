import React, { useState } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import TermsCheckbox from '../components/TermsCheckbox';
import AuthFooter from '../components/AuthFooter';
import { spacing } from '../theme';

const RegisterScreen = ({ navigation }) => {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [agreed, setAgreed] = useState(false);
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
    if (password !== confirmPass) {
      Alert.alert('Passwords do not match', 'Both password fields must be identical.');
      return;
    }
    if (!agreed) {
      Alert.alert(
        'Terms required',
        'Please agree to the Terms of Service and Privacy Policy to continue.'
      );
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
        label="Email or Username"
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

      <AuthFooter
        text="Already have an account?"
        linkText="Log In"
        onPress={() => navigation.goBack()}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  signUp: { marginTop: spacing.md },
});

export default RegisterScreen;
