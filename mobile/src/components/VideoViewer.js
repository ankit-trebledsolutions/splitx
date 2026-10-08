import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canPlayVideos } from '../utils/video';
import AppAlert from './AppAlert';
import { dark, spacing } from '../theme';

const ExpoVideo = canPlayVideos() ? require('expo-video') : null;

const openOutside = (uri) =>
  Linking.openURL(uri).catch((err) => AppAlert.alert('Could not open video', err.message));

// Mounted only while a video is open, so a closed viewer holds no player.
const Player = ({ uri }) => {
  const player = ExpoVideo.useVideoPlayer(uri, (created) => created.play());
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  // A Modal draws under the navigation bar too (see useSheetBottom), and the
  // player's controls sit along its bottom edge.
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.stage, { paddingBottom: bottom }]}>
      <ExpoVideo.VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={dark.text} />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>This video could not be played here.</Text>
          <TouchableOpacity style={styles.outsideButton} activeOpacity={0.8} onPress={() => openOutside(uri)}>
            <Text style={styles.outsideText}>Open in another app</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

/**
 * Full-screen video, laid out like ImageViewer: close, who added it and the
 * caption, download and (with `onDelete`) delete. `video` is { uri, title,
 * caption } or null. A build from before videos has no player, so there the
 * video is handed to another app on the phone instead.
 */
const VideoViewer = ({ video, onClose, onSave, saving = false, onDelete }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Callers build `video` afresh on every render; the address is what matters.
  const uri = video?.uri;

  useEffect(() => {
    if (!uri || ExpoVideo) return;
    openOutside(uri);
    closeRef.current?.();
  }, [uri]);

  if (!ExpoVideo) return null;

  return (
    <Modal
      visible={Boolean(video)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {video && (
        <View style={styles.viewer}>
          <Player key={video.uri} uri={video.uri} />

          <View style={styles.bar}>
            <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onClose}>
              <Ionicons name="close" size={20} color={dark.text} />
            </TouchableOpacity>
            <View style={styles.title}>
              <Text style={styles.name} numberOfLines={1}>
                {video.title}
              </Text>
              {video.caption ? (
                <Text style={styles.caption} numberOfLines={2}>
                  {video.caption}
                </Text>
              ) : null}
            </View>
            {onSave && (
              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.8}
                disabled={saving}
                onPress={onSave}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={dark.text} />
                ) : (
                  <Ionicons name="download-outline" size={19} color={dark.text} />
                )}
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={onDelete}>
                <Ionicons name="trash-outline" size={18} color="#F87171" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, justifyContent: 'center' },
  video: { flex: 1, width: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorText: { color: dark.text, fontSize: 14, textAlign: 'center' },
  outsideButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  outsideText: { color: dark.text, fontSize: 13, fontWeight: '600' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  name: { color: dark.text, fontSize: 15, fontWeight: '700' },
  caption: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
});

export default VideoViewer;
