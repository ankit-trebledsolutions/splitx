import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { StreamCall, CallContent } from '@stream-io/video-react-native-sdk';
import { useStreamClient } from '../context/StreamVideoProvider';
import { dark, radius, spacing } from '../theme';

// Android needs runtime consent for the camera/mic before a call can open
// them; iOS prompts on first use via the Info.plist strings. A voice call
// only needs the mic. Returns false if the user denies anything required.
const requestCallPermissions = async (audioOnly) => {
  if (Platform.OS !== 'android') return true;
  const needed = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (!audioOnly) needed.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const result = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
};

// One shared room per group: the call id IS the group id, so everyone who
// taps the call button in the same group lands in the same call.
const CallScreen = ({ route, navigation }) => {
  const { callId, audioOnly = false } = route.params;
  const { client } = useStreamClient();

  const [call, setCall] = useState(null);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    if (!client) return undefined;

    const activeCall = client.call('default', callId);
    let cancelled = false;

    (async () => {
      try {
        const granted = await requestCallPermissions(audioOnly);
        if (cancelled) return;
        if (!granted) {
          setJoinError(new Error('Camera and microphone access are needed to join the call.'));
          return;
        }
        if (audioOnly) await activeCall.camera.disable();
        await activeCall.join({ create: true });
        if (!cancelled) setCall(activeCall);
      } catch (err) {
        if (!cancelled) setJoinError(err);
      }
    })();

    return () => {
      cancelled = true;
      activeCall.leave().catch(() => {});
    };
  }, [client, callId, audioOnly]);

  if (!client || joinError) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>
          {joinError ? 'Could not join the call' : 'Calls are unavailable right now'}
        </Text>
        <Text style={styles.fallbackText}>
          {joinError?.message ?? 'Check your connection and try again.'}
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={navigation.goBack} activeOpacity={0.8}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!call) {
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
        <CallContent onHangupCallHandler={navigation.goBack} />
      </StreamCall>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  fallback: {
    flex: 1,
    backgroundColor: dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fallbackTitle: {
    color: dark.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
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
