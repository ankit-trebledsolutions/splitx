import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { dark, spacing } from '../theme';
import { formatDuration } from '../utils/attachments';

// Only one voice note plays at a time: starting one pauses whichever was playing.
let pauseCurrent = null;

const Shell = ({ mine, icon, busy, onPress, progress, label }) => {
  const tint = mine ? '#04241A' : dark.text;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.button, mine ? styles.buttonMine : styles.buttonTheirs]}
        activeOpacity={0.8}
        onPress={onPress}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Ionicons name={icon} size={18} color={tint} style={icon === 'play' && styles.playNudge} />
        )}
      </TouchableOpacity>
      <View style={styles.body}>
        <View style={[styles.track, mine && styles.trackMine]}>
          <View
            style={[
              styles.fill,
              mine && styles.fillMine,
              { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` },
            ]}
          />
        </View>
        <Text style={[styles.time, mine && styles.timeMine]}>{label}</Text>
      </View>
    </View>
  );
};

// Mounted on the first tap, so a chat full of voice notes doesn't create a
// native player for every row up front.
const ActivePlayer = ({ uri, durationMs, mine }) => {
  const player = useAudioPlayer(uri, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const autoStarted = useRef(false);

  // Stable identities: `pauseCurrent` is compared against `pause` across renders.
  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Already released (the row scrolled away).
    }
  }, [player]);

  const play = useCallback(() => {
    if (pauseCurrent && pauseCurrent !== pause) pauseCurrent();
    pauseCurrent = pause;
    player.play();
  }, [player, pause]);

  // The tap that mounted this player was a request to play.
  useEffect(() => {
    if (!status.isLoaded || autoStarted.current) return;
    autoStarted.current = true;
    // Voice notes should be heard even with the ringer switched to silent.
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .catch(() => {})
      .then(play);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isLoaded]);

  // Rewind at the end so the next tap plays from the start.
  useEffect(() => {
    if (!status.didJustFinish) return;
    pause();
    player.seekTo(0).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  useEffect(
    () => () => {
      if (pauseCurrent === pause) pauseCurrent = null;
    },
    [pause]
  );

  const totalMs = status.duration ? status.duration * 1000 : durationMs;
  const currentMs = (status.currentTime ?? 0) * 1000;
  const started = status.playing || currentMs > 0;

  return (
    <Shell
      mine={mine}
      icon={status.playing ? 'pause' : 'play'}
      busy={!status.isLoaded}
      onPress={status.playing ? pause : play}
      progress={totalMs ? currentMs / totalMs : 0}
      label={formatDuration(started ? currentMs : totalMs)}
    />
  );
};

/** Play/pause button, progress bar and length for a voice note in the chat. */
const VoiceNotePlayer = ({ uri, durationMs = 0, mine = false }) => {
  const [active, setActive] = useState(false);

  if (active) return <ActivePlayer uri={uri} durationMs={durationMs} mine={mine} />;
  return (
    <Shell
      mine={mine}
      icon="play"
      onPress={() => setActive(true)}
      progress={0}
      label={formatDuration(durationMs)}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minWidth: 190 },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTheirs: { backgroundColor: 'rgba(255,255,255,0.10)' },
  buttonMine: { backgroundColor: 'rgba(4,36,26,0.16)' },
  playNudge: { marginLeft: 2 },
  body: { flex: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    marginTop: 6,
  },
  trackMine: { backgroundColor: 'rgba(4,36,26,0.22)' },
  fill: { height: 4, borderRadius: 2, backgroundColor: dark.accentGreen },
  fillMine: { backgroundColor: '#04241A' },
  time: { color: dark.textMuted, fontSize: 10, marginTop: 4 },
  timeMine: { color: 'rgba(4,36,26,0.7)' },
});

export default VoiceNotePlayer;
