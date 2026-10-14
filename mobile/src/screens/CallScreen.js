import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  StreamCall,
  CallContent,
  FloatingParticipantView,
  useCallStateHooks,
} from '@stream-io/video-react-native-sdk';
import { useActiveCall } from '../context/ActiveCallProvider';
import { dark, radius, spacing } from '../theme';

// The small draggable self-view snaps to the very top of the call, which is
// under the status bar in this edge-to-edge app. Starting its drag area below
// the bar keeps the tile clear of it in both top corners.
const SelfView = (props) => {
  const insets = useSafeAreaInsets();
  return (
    <FloatingParticipantView
      {...props}
      draggableContainerStyle={{ marginTop: insets.top + spacing.sm }}
    />
  );
};

// Until somebody else is in the call, the big view is the caller's own
// camera (or their avatar on a voice call) and this says who is being rung.
const Ringing = ({ groupName }) => {
  const insets = useSafeAreaInsets();
  const { useRemoteParticipants } = useCallStateHooks();
  const others = useRemoteParticipants();
  if (others.length > 0) return null;
  return (
    <View pointerEvents="none" style={[styles.ringing, { top: insets.top + spacing.xl + 44 }]}>
      {groupName ? <Text style={styles.ringingName}>{groupName}</Text> : null}
      <Text style={styles.ringingText}>Ringing…</Text>
    </View>
  );
};

// Full-screen view of the call the user is in. The call itself lives in
// ActiveCallProvider, so leaving this screen (back / minimize) keeps the call
// running and shows the minimized bar in the chat — only Hang up ends it.
const CallScreen = ({ navigation }) => {
  const { call, groupName, status, error, leave } = useActiveCall();
  const insets = useSafeAreaInsets();

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
    // The call controls sit on the screen bottom and know nothing about the
    // system navigation bar, so the screen ends above it for them.
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StreamCall call={call}>
        <CallContent onHangupCallHandler={hangup} FloatingParticipantView={SelfView} />
        <Ringing groupName={groupName} />
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
  ringing: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  ringingName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
  },
  ringingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
  },
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
