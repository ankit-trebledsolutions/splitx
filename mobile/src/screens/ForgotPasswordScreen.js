import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { forgotPasswordRequest } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import { spacing } from '../theme';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const data = await forgotPasswordRequest(email.trim());
      // Backend returns the OTP in development since no mail provider is set up.
      if (data.devOtp) {
        Alert.alert('Development OTP', `Your code is ${data.devOtp}`);
      }
      navigation.navigate('EnterOtp', { email: email.trim() });
    } catch (err) {
      Alert.alert('Could not send code', err.message);
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
        label="Email Address"
        value={email}
        onChangeText={setEmail}
        placeholder="name@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <View style={styles.spacer} />
      <GradientButton title="Send OTP" onPress={handleSendOtp} loading={loading} />
      <AuthFooter
        text="Remember your password?"
        linkText="Back to Login"
        onPress={() => navigation.goBack()}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  spacer: { flex: 1, minHeight: spacing.xl },
});

export default ForgotPasswordScreen;
