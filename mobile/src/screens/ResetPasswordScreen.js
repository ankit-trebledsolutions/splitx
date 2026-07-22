import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { resetPasswordRequest } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import { spacing } from '../theme';

const ResetPasswordScreen = ({ route, navigation }) => {
  const { resetToken } = route.params;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Both fields must be identical.');
      return;
    }
    setLoading(true);
    try {
      await resetPasswordRequest(resetToken, password);
      navigation.navigate('PasswordChanged');
    } catch (err) {
      Alert.alert('Could not reset password', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your email address to receive a password reset link"
    >
      <TextField
        label="New Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secure
      />
      <TextField
        label="Confirm Password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="••••••••"
        secure
      />
      <View style={styles.spacer} />
      <GradientButton title="Reset Password" onPress={handleReset} loading={loading} />
      <AuthFooter
        text="Remember your password?"
        linkText="Back to Login"
        onPress={() => navigation.popToTop()}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  spacer: { flex: 1, minHeight: spacing.xl },
});

export default ResetPasswordScreen;
