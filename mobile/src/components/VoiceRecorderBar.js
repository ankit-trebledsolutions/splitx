import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';
import AppAlert from './AppAlert';
import { dark, spacing } from '../theme';
import { formatDuration } from '../utils/attachments';

// Anything shorter is a slip of the thumb, not a message.
const MIN_LENGTH_MS = 700;

const discard = (uri) => {
  try {
    if (uri) new File(uri).delete();
  } catch {
    // The cache is cleared by the OS anyway.
  }
};

/**
 * Takes the composer's place while a voice note is being recorded: recording
 * starts as soon as it mounts, the bin cancels, the green button sends.
 * onSend receives { uri, name, type, durationMs }; both callbacks unmount it.
 */
const VoiceRecorderBar = ({ onSend, onCancel, style }) => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [ready, setReady] = useState(false);
  const finishing = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          AppAlert.alert(
            'Allow microphone access',
            'Splix needs the microphone to record voice notes.',
            permission.canAskAgain
              ? [{ text: 'OK' }]
              : [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
          );
          onCancel();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        AppAlert.alert('Could not start recording', err.message);
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Stops the recorder and hands the microphone back, so voice notes played
  // afterwards come out of the speaker rather than the earpiece.
  const finish = async () => {
    const durationMs = state.durationMillis ?? 0;
    try {
      await recorder.stop();
    } catch {
      // Never started, or already stopped.
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    // The upload needs a file:// uri; a bare path is what some Android versions give.
    const uri = recorder.uri && recorder.uri.startsWith('/') ? `file://${recorder.uri}` : recorder.uri;
    return { uri, durationMs };
  };

  const cancel = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const { uri } = await finish();
    discard(uri);
    onCancel();
  };

  const send = async () => {
    if (finishing.current || !ready) return;
    finishing.current = true;
    const { uri, durationMs } = await finish();
    if (!uri || durationMs < MIN_LENGTH_MS) {
      discard(uri);
      onCancel();
      return;
    }
    onSend({ uri, name: `voice-note-${Date.now()}.m4a`, type: 'audio/mp4', durationMs });
  };

  return (
    <View style={[styles.bar, style]}>
      <TouchableOpacity style={styles.cancel} activeOpacity={0.7} onPress={cancel}>
        <Ionicons name="trash-outline" size={19} color="#F87171" />
      </TouchableOpacity>

      <View style={styles.status}>
        {ready ? (
          <Animated.View style={[styles.dot, { opacity: pulse }]} />
        ) : (
          <ActivityIndicator size="small" color={dark.textMuted} />
        )}
        <Text style={styles.timer}>{formatDuration(state.durationMillis ?? 0)}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {ready ? 'Recording…' : 'Starting…'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.send, !ready && styles.sendDisabled]}
        activeOpacity={0.85}
        onPress={send}
        disabled={!ready}
      >
        <Ionicons name="send" size={17} color="#04241A" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    backgroundColor: '#080D10',
  },
  cancel: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F87171' },
  timer: { color: dark.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { flex: 1, color: dark.textMuted, fontSize: 12 },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: dark.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
});

export default VoiceRecorderBar;
