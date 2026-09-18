import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Linking,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { avatarColor } from '../../components/Avatar';
import { API_ORIGIN } from '../../api/client';
import { dark, radius, spacing } from '../../theme';
import { initials } from '../../utils/format';
import AppAlert from '../../components/AppAlert';
import {
  loadSavedPhotoIds,
  savePhotoToGallery,
  SavePermissionError,
} from '../../utils/saveToGallery';

const NUM_COLUMNS = 3;
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.md;
const RECENT_MS = 24 * 60 * 60 * 1000; // green "new" dot for photos < 1 day old

const absolute = (url) => (url ? (url.startsWith('http') ? url : `${API_ORIGIN}${url}`) : null);

// Full-size image: what gets downloaded and shown full-screen.
const uriOf = (photo) => absolute(photo.imageUrl);
// Small square for the grid, so opening the gallery doesn't pull every full
// photo over the network. Older photos have none and fall back to the original.
const thumbOf = (photo) => absolute(photo.thumbUrl) ?? uriOf(photo);

/**
 * Photo grid with per-member filter chips, per the Gallery mockup.
 *
 * Other members' photos carry a download icon: tapping the tile saves the
 * image to the phone's own gallery (WhatsApp-style), after which the icon
 * becomes a tick and tapping opens the photo full-screen instead.
 */
const GalleryTab = ({ photos, loading, currentUserId, onAddPhoto, onDeletePhoto }) => {
  const [filter, setFilter] = useState('all');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);

  // Fixed tile size: a row with one or two photos must not stretch them to fill it.
  const { width } = useWindowDimensions();
  const tileSize = Math.floor(
    (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
  );

  useEffect(() => {
    let active = true;
    loadSavedPhotoIds().then((ids) => active && setSavedIds(ids));
    return () => {
      active = false;
    };
  }, []);

  const savePhoto = useCallback(async (photo) => {
    const uri = uriOf(photo);
    if (!uri) return;
    setSavingIds((prev) => new Set(prev).add(photo._id));
    try {
      await savePhotoToGallery(photo._id, uri);
      setSavedIds((prev) => new Set(prev).add(photo._id));
    } catch (err) {
      if (err instanceof SavePermissionError) {
        AppAlert.alert(
          'Allow photo access',
          'Splix needs permission to add photos to your gallery.',
          err.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
        );
      } else {
        AppAlert.alert('Could not save photo', err.message);
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(photo._id);
        return next;
      });
    }
  }, []);

  // One chip per member who has uploaded, with their photo count.
  const uploaders = useMemo(() => {
    const byId = new Map();
    for (const photo of photos) {
      const user = photo.uploadedBy;
      if (!user?._id) continue;
      const entry = byId.get(user._id) ?? { user, count: 0 };
      entry.count += 1;
      byId.set(user._id, entry);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count);
  }, [photos]);

  const visible = useMemo(
    () => (filter === 'all' ? photos : photos.filter((p) => p.uploadedBy?._id === filter)),
    [photos, filter]
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={dark.accentGreen} />
      </View>
    );
  }

  const renderPhoto = ({ item }) => {
    const isRecent = Date.now() - new Date(item.createdAt).getTime() < RECENT_MS;
    const uploaderName = item.uploadedBy?.name ?? '';
    const isMine = item.uploadedBy?._id === currentUserId;

    const imageUri = uriOf(item);
    const isSaving = savingIds.has(item._id);
    // Your own uploads are already on your phone, so they skip the download step.
    const needsDownload = Boolean(imageUri) && !isMine && !savedIds.has(item._id);

    const onPress = () => {
      if (isSaving) return;
      if (needsDownload) savePhoto(item);
      else if (imageUri) setViewing(item);
      else if (item.caption) AppAlert.alert(uploaderName || 'Photo', item.caption);
    };

    return (
      <TouchableOpacity
        style={[
          styles.tile,
          { width: tileSize, height: tileSize, backgroundColor: item.color || '#173A33' },
        ]}
        activeOpacity={0.85}
        onPress={onPress}
        onLongPress={() => isMine && onDeletePhoto?.(item)}
      >
        {imageUri ? (
          <Image
            source={{ uri: thumbOf(item) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.tileEmoji}>{item.emoji || '🖼️'}</Text>
        )}

        <View style={[styles.uploaderChip, { backgroundColor: avatarColor(uploaderName) }]}>
          <Text style={styles.uploaderChipText}>{initials(uploaderName)}</Text>
        </View>

        {/* Top-right corner: download / saving / saved for other members' photos,
            otherwise the "new" dot. */}
        {imageUri && !isMine ? (
          <View style={[styles.downloadBadge, !needsDownload && styles.downloadBadgeDone]}>
            {isSaving ? (
              <ActivityIndicator size="small" color={dark.text} />
            ) : (
              <Ionicons
                name={needsDownload ? 'arrow-down' : 'checkmark'}
                size={14}
                color={needsDownload ? dark.text : '#04241A'}
              />
            )}
          </View>
        ) : (
          isRecent && <View style={styles.recentDot} />
        )}

        {item.taggedMembers?.length ? (
          <View style={styles.peopleBadge}>
            <Ionicons name="people" size={9} color={dark.text} />
            <Text style={styles.peopleBadgeText}>{item.taggedMembers.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
    <FlatList
      data={visible}
      key={NUM_COLUMNS}
      numColumns={NUM_COLUMNS}
      keyExtractor={(item) => item._id}
      renderItem={renderPhoto}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={styles.faceScan}
              activeOpacity={0.8}
              onPress={() =>
                AppAlert.alert('Face Scan', 'Find photos you appear in — coming soon.')
              }
            >
              <Ionicons name="scan-outline" size={15} color="#B79CFF" />
              <Text style={styles.faceScanText}>Face Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraButton} activeOpacity={0.8} onPress={onAddPhoto}>
              <Ionicons name="camera-outline" size={17} color={dark.text} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, filter === 'all' && styles.chipActive]}
              activeOpacity={0.8}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>
                All photos
              </Text>
              <Text style={[styles.chipCount, filter === 'all' && styles.chipTextActive]}>
                {photos.length}
              </Text>
            </TouchableOpacity>

            {uploaders.map(({ user, count }) => {
              const active = filter === user._id;
              return (
                <TouchableOpacity
                  key={user._id}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.8}
                  onPress={() => setFilter(active ? 'all' : user._id)}
                >
                  <View style={[styles.chipAvatar, { backgroundColor: avatarColor(user.name) }]}>
                    <Text style={styles.chipAvatarText}>{initials(user.name)}</Text>
                  </View>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {initials(user.name)}
                  </Text>
                  <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No photos yet — tap the camera (or +) to add the first memory.
        </Text>
      }
    />

    <Modal
      visible={Boolean(viewing)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setViewing(null)}
    >
      {viewing && (
        <View style={styles.viewer}>
          <Image source={{ uri: uriOf(viewing) }} style={styles.viewerImage} resizeMode="contain" />

          <View style={styles.viewerBar}>
            <TouchableOpacity
              style={styles.viewerButton}
              activeOpacity={0.8}
              onPress={() => setViewing(null)}
            >
              <Ionicons name="close" size={20} color={dark.text} />
            </TouchableOpacity>
            <View style={styles.viewerTitle}>
              <Text style={styles.viewerName} numberOfLines={1}>
                {viewing.uploadedBy?._id === currentUserId ? 'You' : viewing.uploadedBy?.name}
              </Text>
              {viewing.caption ? (
                <Text style={styles.viewerCaption} numberOfLines={2}>
                  {viewing.caption}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.viewerButton}
              activeOpacity={0.8}
              disabled={savingIds.has(viewing._id)}
              onPress={() => savePhoto(viewing)}
            >
              {savingIds.has(viewing._id) ? (
                <ActivityIndicator size="small" color={dark.text} />
              ) : (
                <Ionicons name="download-outline" size={19} color={dark.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: GRID_PADDING, paddingBottom: 100 },
  empty: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  faceScan: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(183,156,255,0.45)',
    backgroundColor: 'rgba(183,156,255,0.08)',
    borderRadius: 22,
    paddingVertical: spacing.sm + 3,
  },
  faceScanText: { color: '#B79CFF', fontSize: 13, fontWeight: '600' },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipRow: { marginTop: spacing.md, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    marginRight: spacing.sm,
  },
  chipActive: {
    borderColor: dark.accentGreen,
    backgroundColor: 'rgba(0,196,208,0.10)',
  },
  chipAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: { color: '#0B1116', fontSize: 7, fontWeight: '800' },
  chipText: { color: dark.textMuted, fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: dark.accentGreen },
  chipCount: { color: dark.textMuted, fontSize: 10, fontWeight: '700' },

  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileEmoji: { fontSize: 34 },
  uploaderChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  uploaderChipText: { color: '#0B1116', fontSize: 8, fontWeight: '800' },
  recentDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: dark.accentGreen,
  },
  downloadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBadgeDone: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },

  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerBar: {
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
  viewerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerTitle: { flex: 1 },
  viewerName: { color: dark.text, fontSize: 15, fontWeight: '700' },
  viewerCaption: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  peopleBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  peopleBadgeText: { color: dark.text, fontSize: 9, fontWeight: '700' },
});

export default GalleryTab;
