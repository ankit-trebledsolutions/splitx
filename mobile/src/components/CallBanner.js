import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StreamCall, useCallStateHooks } from '@stream-io/video-react-native-sdk';
import { useStreamClient } from '../context/StreamVideoProvider';
import { useActiveCall } from '../context/ActiveCallProvider';
import { dark, radius, spacing } from '../theme';

const HANGUP_RED = '#EF4444';

const formatDuration = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Ticks a live MM:SS from the call's session start time.
const useLiveDuration = () => {
  const { useCallStartedAt } = useCallStateHooks();
  const startedAt = useCallStartedAt();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
};

// Shown to group members who are NOT in the call.
const JoinBanner = ({ onJoin }) => {
  const { useCallSession } = useCallStateHooks();
  const session = useCallSession();
  const count = session?.participants?.length ?? 0;
  const seconds = useLiveDuration();

  if (count === 0) return null; // no active call

  return (
    <View style={styles.joinBanner}>
      <Ionicons name="videocam" size={16} color={dark.accentGreen} />
      <Text style={styles.joinText} numberOfLines={1}>
        Group call · {count} in call · {formatDuration(seconds)}
      </Text>
      <TouchableOpacity style={styles.joinBtn} onPress={onJoin} activeOpacity={0.85}>
        <Text style={styles.joinBtnText}>Join</Text>
      </TouchableOpacity>
    </View>
  );
};

// Shown to the member who IS in the call, while they browse the chat.
const MiniBar = ({ onReturn, onHangup }) => {
  const { useMicrophoneState } = useCallStateHooks();
  const { microphone, isMute } = useMicrophoneState();
  const seconds = useLiveDuration();

  return (
    <TouchableOpacity style={styles.miniBar} activeOpacity={0.9} onPress={onReturn}>
      <View style={styles.liveDot} />
      <Text style={styles.miniText} numberOfLines={1}>
        In call · {formatDuration(seconds)}
      </Text>
      <View style={styles.miniControls}>
        <TouchableOpacity
          style={styles.miniIcon}
          onPress={() => microphone.toggle()}
          activeOpacity={0.8}
        >
          <Ionicons name={isMute ? 'mic-off' : 'mic'} size={17} color={dark.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniIcon, styles.hangup]}
          onPress={onHangup}
          activeOpacity={0.8}
        >
          <Ionicons name="call" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

/**
 * Sits under the group-chat header. If the current user is in this group's
 * call it shows the minimized control bar; otherwise it watches the group's
 * Stream call and shows a "Join" banner whenever anyone else is in it.
 */
const CallBanner = ({ groupId, navigation }) => {
  const { client } = useStreamClient();
  const { call: activeCall, groupId: activeGroupId, status, join, leave } = useActiveCall();
  const inThisCall = status === 'joined' && activeGroupId === groupId && !!activeCall;

  const [watchCall, setWatchCall] = useState(null);

  // Watch this group's call (when we're not in it) so the banner appears as
  // soon as someone else starts one. The WebSocket pushes live updates; the
  // periodic re-fetch is a self-healing safety net.
  useEffect(() => {
    if (!client || inThisCall) {
      setWatchCall(null);
      return undefined;
    }
    let active = true;
    const c = client.call('default', groupId);
    const refresh = () =>
      c
        .get()
        .then(() => {
          if (active) setWatchCall(c);
        })
        .catch(() => {
          if (active) setWatchCall(null);
        });
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, groupId, inThisCall]);

  if (inThisCall) {
    return (
      <StreamCall call={activeCall}>
        <MiniBar onReturn={() => navigation.navigate('Call')} onHangup={() => leave()} />
      </StreamCall>
    );
  }

  if (!watchCall) return null;
  return (
    <StreamCall call={watchCall}>
      <JoinBanner
        onJoin={() => {
          join(groupId, { audioOnly: false });
          navigation.navigate('Call');
        }}
      />
    </StreamCall>
  );
};

const styles = StyleSheet.create({
  joinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card2,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: dark.border,
  },
  joinText: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '600', marginLeft: spacing.sm },
  joinBtn: {
    backgroundColor: dark.accentGreen,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  joinBtnText: { color: '#04121C', fontSize: 13, fontWeight: '700' },
  miniBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B3D2E',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: dark.accentGreen },
  miniText: { flex: 1, color: dark.text, fontSize: 13, fontWeight: '700', marginLeft: spacing.sm },
  miniControls: { flexDirection: 'row', alignItems: 'center' },
  miniIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: spacing.sm,
  },
  hangup: { backgroundColor: HANGUP_RED },
});

export default CallBanner;
