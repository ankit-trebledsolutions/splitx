import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { resendCodeRequest, verifyOtpRequest } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import GradientButton from '../components/GradientButton';
import AuthFooter from '../components/AuthFooter';
import { dark, radius, spacing } from '../theme';
import AppAlert from '../components/AppAlert';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60; // fallback; the server says how long to wait

/**
 * The 6-digit code screen, shared by two flows:
 *   purpose 'verify-email'   sign-up: the right code logs the person in
 *   purpose 'reset-password' forgot password: the right code leads to New Password
 */
const EnterOtpScreen = ({ route, navigation }) => {
  const { email, purpose = 'reset-password', retryAfter, devOtp } = route.params;
  const isSignup = purpose === 'verify-email';
  const { verifyEmail } = useAuth();
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(retryAfter ?? RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef(null);

  // Open the keyboard once the screen has finished sliding in. autoFocus fires
  // mid-animation, and Android sometimes drops a focus request made then.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    const unsubscribe = navigation.addListener('transitionEnd', focus);
    // Fallback for when there is no transition to wait for (e.g. deep link).
    const timer = setTimeout(focus, 600);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [navigation]);

  // Only ever set when the server has no email provider configured (development).
  useEffect(() => {
    if (devOtp) AppAlert.alert('Development code', `No email provider is set up, so here is your code: ${devOtp}`);
  }, [devOtp]);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH) {
      AppAlert.alert('Incomplete code', `Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        // Success sets the signed-in user, and the navigator swaps to the app.
        await verifyEmail(email, otp);
      } else {
        const { resetToken } = await verifyOtpRequest(email, otp);
        navigation.navigate('ResetPassword', { resetToken });
      }
    } catch (err) {
      setOtp('');
      AppAlert.alert('Verification failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const data = await resendCodeRequest(email, purpose);
      if (data.devOtp) AppAlert.alert('Development code', `Your new code is ${data.devOtp}`);
      else AppAlert.alert('Code sent', `We sent a new code to ${email}.`);
      setOtp('');
      setSecondsLeft(data.retryAfter ?? RESEND_SECONDS);
    } catch (err) {
      // Asked too soon: line the countdown up with the server's clock.
      if (err.code === 'OTP_COOLDOWN') setSecondsLeft(err.details.retryAfter);
      AppAlert.alert('Could not resend code', err.message);
    } finally {
      setResending(false);
    }
  };

  const shown = Math.max(secondsLeft, 0);
  const timerLabel = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;

  return (
    <AuthLayout
      title={isSignup ? 'Verify your email' : 'Enter OTP'}
      subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
    >
      <View style={styles.boxesRow}>
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

        {/* The real input, stretched invisibly over the boxes so a tap lands on
            it directly. The system then opens the keyboard itself, every time.
            Calling focus() from a tap handler instead does nothing once the
            input is already focused, i.e. after the keyboard has been dismissed. */}
        <TextInput
          ref={inputRef}
          value={otp}
          // No maxLength: a pasted "Your code is 482913" must reach the digit filter whole.
          onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          importantForAutofill="yes"
          caretHidden
          selectionColor="transparent"
          underlineColorAndroid="transparent"
          style={styles.overlayInput}
        />
      </View>

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
      <GradientButton
        title={isSignup ? 'Verify & Continue' : 'Verify'}
        onPress={handleVerify}
        loading={loading}
      />
      <AuthFooter
        text="Didn't receive it? Check your spam folder, or"
        linkText="Resend"
        onPress={() =>
          secondsLeft > 0
            ? AppAlert.alert('Please wait', `You can resend the code in ${timerLabel}.`)
            : handleResend()
        }
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  // Covers the whole row of boxes. Transparent rather than opacity: 0, which
  // some Android versions treat as not worth focusing.
  overlayInput: {
    ...StyleSheet.absoluteFillObject,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
    padding: 0,
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
