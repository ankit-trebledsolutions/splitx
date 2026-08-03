import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { avatarColor } from '../../components/Avatar';
import { API_ORIGIN } from '../../api/client';
import { dark, radius, spacing } from '../../theme';
import { initials } from '../../utils/format';

const NUM_COLUMNS = 3;
const RECENT_MS = 24 * 60 * 60 * 1000; // green "new" dot for photos < 1 day old

// Emoji-tile photo grid with per-member filter chips, per the Gallery mockup.
const GalleryTab = ({ photos, loading, currentUserId, onAddPhoto, onDeletePhoto }) => {
  const [filter, setFilter] = useState('all');

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

    const imageUri = item.imageUrl
      ? item.imageUrl.startsWith('http')
        ? item.imageUrl
        : `${API_ORIGIN}${item.imageUrl}`
      : null;

    return (
      <TouchableOpacity
        style={[styles.tile, { backgroundColor: item.color || '#173A33' }]}
        activeOpacity={0.85}
        onPress={() => item.caption && Alert.alert(uploaderName || 'Photo', item.caption)}
        onLongPress={() => isMine && onDeletePhoto?.(item)}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={styles.tileEmoji}>{item.emoji || '🖼️'}</Text>
        )}

        <View style={[styles.uploaderChip, { backgroundColor: avatarColor(uploaderName) }]}>
          <Text style={styles.uploaderChipText}>{initials(uploaderName)}</Text>
        </View>

        {isRecent && <View style={styles.recentDot} />}

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
                Alert.alert('Face Scan', 'Find photos you appear in — coming soon.')
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
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
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

  gridRow: { gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flex: 1,
    aspectRatio: 1,
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
