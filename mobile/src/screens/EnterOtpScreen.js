import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { forgotPasswordRequest, verifyOtpRequest } from '../api/auth.api';
import AuthLayout from '../components/AuthLayout';
import GradientButton from '../components/GradientButton';
import { dark, radius, spacing } from '../theme';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 45;

const EnterOtpScreen = ({ route, navigation }) => {
  const { email } = route.params;
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Incomplete code', `Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setLoading(true);
    try {
      const { resetToken } = await verifyOtpRequest(email, otp);
      navigation.navigate('ResetPassword', { resetToken });
    } catch (err) {
      Alert.alert('Verification failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      const data = await forgotPasswordRequest(email);
      if (data.devOtp) {
        Alert.alert('Development OTP', `Your code is ${data.devOtp}`);
      }
      setOtp('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      Alert.alert('Could not resend code', err.message);
    }
  };

  const timerLabel = `0:${String(Math.max(secondsLeft, 0)).padStart(2, '0')}`;

  return (
    <AuthLayout title="Enter OTP" subtitle="We have sent a 6-digit code to your email address">
      {/* Hidden input drives the six display boxes below. */}
      <TextInput
        ref={inputRef}
        value={otp}
        onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.hiddenInput}
        autoFocus
      />

      <TouchableOpacity
        activeOpacity={1}
        style={styles.boxesRow}
        onPress={() => inputRef.current?.focus()}
      >
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const digit = otp[i];
          const isActive = i === otp.length && otp.length < OTP_LENGTH;
          return (
            <View
              key={i}
              style={[styles.box, (digit || isActive) && styles.boxFilled]}
            >
              <Text style={styles.boxDigit}>{digit ?? ''}</Text>
            </View>
          );
        })}
      </TouchableOpacity>

      <View style={styles.resendRow}>
        {secondsLeft > 0 ? (
          <Text style={styles.resendText}>
            Resend code in <Text style={styles.resendTimer}>{timerLabel}</Text>
          </Text>
        ) : (
          <TouchableOpacity onPress={handleResend}>
            <Text style={styles.resendTimer}>Resend code</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />
      <GradientButton title="Verify" onPress={handleVerify} loading={loading} />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radius.md,
    backgroundColor: dark.surface,
    borderWidth: 1.5,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: dark.accentGreen },
  boxDigit: { color: dark.text, fontSize: 28, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: spacing.xl },
  resendText: { color: dark.textMuted, fontSize: 15 },
  resendTimer: { color: dark.accentGreen, fontSize: 15, fontWeight: '600' },
  spacer: { flex: 1, minHeight: spacing.xl },
});

export default EnterOtpScreen;
