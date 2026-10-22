import React, { useEffect, useRef } from 'react';
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
import { creditsLabel } from '../data/wallet';
import { dark, radius, spacing } from '../theme';

const AMBER = '#F5B342';
// Clears the SDK's call controls (44pt buttons with 12pt above and below).
const LOW_NOTICE_LIFT = 68 + spacing.md;
const CLOSE_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

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
// camera (or their avatar on a voice call) and this says who is being rung,
// and what the call costs them when it does.
const Ringing = ({ groupName, billing }) => {
  const insets = useSafeAreaInsets();
  const { useRemoteParticipants } = useCallStateHooks();
  const others = useRemoteParticipants();
  if (others.length > 0) return null;
  return (
    <View pointerEvents="none" style={[styles.ringing, { top: insets.top + spacing.xl + 44 }]}>
      {groupName ? <Text style={styles.ringingName}>{groupName}</Text> : null}
      <Text style={styles.ringingText}>Ringing…</Text>
      {billing ? (
        <Text style={styles.ringingCost}>
          Uses {creditsLabel(billing.price)} per {billing.blockMinutes} min
        </Text>
      ) : null}
    </View>
  );
};

// The server's warning to the person paying: the next block of the call
// cannot be paid. Over the call, never in its way; it can be closed.
const CreditsLowNotice = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.lowNotice, { bottom: insets.bottom + LOW_NOTICE_LIFT }]}>
      <Ionicons name="wallet-outline" size={16} color={AMBER} />
      <Text style={styles.lowText}>
        Your credits run out in about a minute. The call will end then.
      </Text>
      <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={CLOSE_HIT_SLOP}>
        <Ionicons name="close" size={16} color={dark.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

// Full-screen view of the call the user is in. The call itself lives in
// ActiveCallProvider, so leaving this screen (back / minimize) keeps the call
// running and shows the minimized bar in the chat — only Hang up ends it, or
// the server ending it for everyone.
const CallScreen = ({ navigation }) => {
  const { call, groupName, status, error, billing, creditsLow, leave, dismissCreditsLow } =
    useActiveCall();
  const insets = useSafeAreaInsets();

  // However the call is over while this screen shows it (hung up, ended by
  // the server, or never started for lack of credits), it goes back to the
  // chat. Only after a call: opened while idle it stays as it always has.
  const wasInCall = useRef(false);
  useEffect(() => {
    if (status === 'joining' || status === 'joined') {
      wasInCall.current = true;
    } else if (status === 'idle' && wasInCall.current) {
      wasInCall.current = false;
      if (navigation.isFocused()) navigation.goBack();
    }
  }, [status, navigation]);

  // Going back follows from the call being over (above).
  const hangup = () => leave();

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
        <Ringing groupName={groupName} billing={billing} />
        {creditsLow ? <CreditsLowNotice onClose={dismissCreditsLow} /> : null}
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
  ringingCost: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
  },
  lowNotice: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(12,20,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(245,179,66,0.45)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 4,
    zIndex: 30,
  },
  lowText: { flex: 1, color: dark.text, fontSize: 13, lineHeight: 18 },
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
