import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StreamCall, CallContent } from '@stream-io/video-react-native-sdk';
import { useActiveCall } from '../context/ActiveCallProvider';
import { dark, radius, spacing } from '../theme';

// Full-screen view of the call the user is in. The call itself lives in
// ActiveCallProvider, so leaving this screen (back / minimize) keeps the call
// running and shows the minimized bar in the chat — only Hang up ends it.
const CallScreen = ({ navigation }) => {
  const { call, status, error, leave } = useActiveCall();

  const hangup = async () => {
    await leave();
    navigation.goBack();
  };

  if (status === 'error' || error) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Could not join the call</Text>
        <Text style={styles.fallbackText}>
          {error?.message ?? 'Check your connection and try again.'}
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={navigation.goBack} activeOpacity={0.8}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status !== 'joined' || !call) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={dark.accentGreen} size="large" />
        <Text style={styles.fallbackText}>Joining call…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StreamCall call={call}>
        <CallContent onHangupCallHandler={hangup} />
        {/* Minimize: return to the chat while staying in the call. */}
        <TouchableOpacity
          style={styles.minimize}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-down" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </StreamCall>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  minimize: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 20,
  },
  fallback: {
    flex: 1,
    backgroundColor: dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fallbackTitle: { color: dark.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  fallbackText: {
    color: dark.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  backButton: {
    marginTop: spacing.lg,
    backgroundColor: dark.button,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
  },
  backButtonText: { color: '#04121C', fontSize: 14, fontWeight: '700' },
});

export default CallScreen;
