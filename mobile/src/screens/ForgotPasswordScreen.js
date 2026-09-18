import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { forgotPasswordRequest } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import { spacing } from '../theme';
import AppAlert from '../components/AppAlert';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      AppAlert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const data = await forgotPasswordRequest(email.trim());
      navigation.navigate('EnterOtp', {
        email: email.trim().toLowerCase(),
        purpose: 'reset-password',
        retryAfter: data.retryAfter,
        devOtp: data.devOtp,
      });
    } catch (err) {
      // A code went out moments ago: it is still valid, so carry on to the code
      // screen rather than leaving them stuck here.
      if (err.code === 'OTP_COOLDOWN') {
        navigation.navigate('EnterOtp', {
          email: email.trim().toLowerCase(),
          purpose: 'reset-password',
          retryAfter: err.details.retryAfter,
        });
        return;
      }
      AppAlert.alert('Could not send code', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Enter your email address and we'll send you a 6-digit code to reset your password"
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
