import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Linking,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { avatarColor } from '../../components/Avatar';
import ImageViewer from '../../components/ImageViewer';
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
const DANGER = '#F87171';

const absolute = (url) => (url ? (url.startsWith('http') ? url : `${API_ORIGIN}${url}`) : null);

// Full-size image: what gets downloaded and shown full-screen.
const uriOf = (photo) => absolute(photo.imageUrl);
// Small square for the grid, so opening the gallery doesn't pull every full
// photo over the network. Older photos have none and fall back to the original.
const thumbOf = (photo) => absolute(photo.thumbUrl) ?? uriOf(photo);

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const alertSavePermission = (err) =>
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

/**
 * Photo grid with per-member filter chips, per the Gallery mockup.
 *
 * Other members' photos carry a download icon: tapping the tile saves the
 * image to the phone's own gallery (WhatsApp-style), after which the icon
 * becomes a tick and tapping opens the photo full-screen instead.
 *
 * Long-pressing a tile (or the Select button) switches to selection mode,
 * where taps tick photos and the bar on top downloads or deletes them all at
 * once. Only your own uploads can be deleted; `onDeletePhotos(photos)` does it
 * and resolves to true once they are gone.
 */
const GalleryTab = ({ photos, loading, currentUserId, onAddPhoto, onDeletePhotos }) => {
  const [filter, setFilter] = useState('all');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);
  // null outside selection mode, otherwise the set of ticked photo ids.
  const [selectedIds, setSelectedIds] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selecting = selectedIds !== null;

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

  // Android's back button leaves selection mode before it leaves the screen.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedIds(null);
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  // Saves one photo and keeps the tile's spinner/tick in step. Throws on
  // failure so callers decide how to report it.
  const savePhoto = useCallback(async (photo) => {
    const uri = uriOf(photo);
    if (!uri) return;
    setSavingIds((prev) => new Set(prev).add(photo._id));
    try {
      await savePhotoToGallery(photo._id, uri);
      setSavedIds((prev) => new Set(prev).add(photo._id));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(photo._id);
        return next;
      });
    }
  }, []);

  const saveOne = useCallback(
    async (photo) => {
      try {
        await savePhoto(photo);
      } catch (err) {
        if (err instanceof SavePermissionError) alertSavePermission(err);
        else AppAlert.alert('Could not save photo', err.message);
      }
    },
    [savePhoto]
  );

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

  // Ticked photos that still exist (one may have been deleted from another phone).
  const selected = useMemo(
    () => (selectedIds ? photos.filter((p) => selectedIds.has(p._id)) : []),
    [photos, selectedIds]
  );
  const selectedMine = selected.filter((p) => p.uploadedBy?._id === currentUserId);
  const selectedDownloadable = selected.filter((p) => uriOf(p));
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds?.has(p._id));

  const toggleSelected = (photo) =>
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(photo._id)) next.delete(photo._id);
      else next.add(photo._id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visible.map((p) => p._id)));

  const downloadSelected = async () => {
    if (!selectedDownloadable.length || bulkBusy) return;
    setBulkBusy(true);
    let saved = 0;
    let failed = 0;
    try {
      for (const photo of selectedDownloadable) {
        try {
          // One at a time: a phone on mobile data copes better than with 30 at once.
          // eslint-disable-next-line no-await-in-loop
          await savePhoto(photo);
          saved += 1;
        } catch (err) {
          // Without permission none of them can be saved, so stop asking.
          if (err instanceof SavePermissionError) {
            alertSavePermission(err);
            return;
          }
          failed += 1;
        }
      }
    } finally {
      setBulkBusy(false);
    }
    setSelectedIds(null);
    if (failed) {
      AppAlert.alert(
        'Download finished',
        `${plural(saved, 'photo')} saved, ${failed} failed — try those again.`
      );
    } else {
      AppAlert.alert('Photos saved', `${plural(saved, 'photo')} saved to your phone’s gallery.`);
    }
  };

  const confirmDelete = (toDelete, othersCount = 0) => {
    const message = [
      toDelete.length === 1
        ? 'Remove this photo from the gallery for everyone?'
        : `Remove these ${toDelete.length} photos from the gallery for everyone?`,
      othersCount
        ? `${plural(othersCount, 'selected photo')} from other members will stay: only the person who uploaded a photo can delete it.`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    AppAlert.alert(toDelete.length === 1 ? 'Delete photo' : 'Delete photos', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBulkBusy(true);
          const done = await onDeletePhotos?.(toDelete);
          setBulkBusy(false);
          if (done) setSelectedIds(null);
        },
      },
    ]);
  };

  const deleteSelected = () => {
    if (bulkBusy) return;
    if (!selectedMine.length) {
      AppAlert.alert(
        'Nothing to delete',
        'Only the person who uploaded a photo can delete it, and none of the selected photos are yours.'
      );
      return;
    }
    confirmDelete(selectedMine, selected.length - selectedMine.length);
  };

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
    const isSelected = selecting && selectedIds.has(item._id);
    // Your own uploads are already on your phone, so they skip the download step.
    const needsDownload = Boolean(imageUri) && !isMine && !savedIds.has(item._id);

    const onPress = () => {
      if (selecting) {
        if (!bulkBusy) toggleSelected(item);
        return;
      }
      if (isSaving) return;
      if (needsDownload) saveOne(item);
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
        onLongPress={() => !selecting && setSelectedIds(new Set([item._id]))}
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

        {isSelected && <View style={styles.tileSelected} />}

        <View style={[styles.uploaderChip, { backgroundColor: avatarColor(uploaderName) }]}>
          <Text style={styles.uploaderChipText}>{initials(uploaderName)}</Text>
        </View>

        {/* Top-right corner: the tick box while selecting; otherwise download /
            saving / saved for other members' photos, or the "new" dot. */}
        {selecting ? (
          <View style={[styles.checkBadge, isSelected && styles.checkBadgeOn]}>
            {isSaving ? (
              <ActivityIndicator size="small" color={isSelected ? '#04241A' : dark.text} />
            ) : (
              isSelected && <Ionicons name="checkmark" size={15} color="#04241A" />
            )}
          </View>
        ) : imageUri && !isMine ? (
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

  const viewingMine = viewing?.uploadedBy?._id === currentUserId;

  return (
    <>
    {/* Stays put above the grid, so the actions are in reach however far down
        the selection goes. */}
    {selecting && (
      <View style={styles.selectBar}>
        <TouchableOpacity
          style={styles.selectBarButton}
          activeOpacity={0.8}
          disabled={bulkBusy}
          onPress={() => setSelectedIds(null)}
        >
          <Ionicons name="close" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.selectCount} numberOfLines={1}>
          {selected.length ? `${selected.length} selected` : 'Select photos'}
        </Text>
        <TouchableOpacity activeOpacity={0.8} disabled={bulkBusy} onPress={toggleSelectAll}>
          <Text style={styles.selectAll}>{allVisibleSelected ? 'Clear' : 'Select all'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectBarButton, !selectedDownloadable.length && styles.disabled]}
          activeOpacity={0.8}
          disabled={!selectedDownloadable.length || bulkBusy}
          onPress={downloadSelected}
        >
          {bulkBusy ? (
            <ActivityIndicator size="small" color={dark.text} />
          ) : (
            <Ionicons name="download-outline" size={18} color={dark.text} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectBarButton, !selectedMine.length && styles.disabled]}
          activeOpacity={0.8}
          disabled={!selected.length || bulkBusy}
          onPress={deleteSelected}
        >
          <Ionicons name="trash-outline" size={17} color={DANGER} />
        </TouchableOpacity>
      </View>
    )}

    <FlatList
      data={visible}
      key={NUM_COLUMNS}
      numColumns={NUM_COLUMNS}
      keyExtractor={(item) => item._id}
      renderItem={renderPhoto}
      extraData={selectedIds}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {!selecting && (
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
              {photos.length > 0 && (
                <TouchableOpacity
                  style={styles.selectButton}
                  activeOpacity={0.8}
                  onPress={() => setSelectedIds(new Set())}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={dark.text} />
                  <Text style={styles.selectButtonText}>Select</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cameraButton} activeOpacity={0.8} onPress={onAddPhoto}>
                <Ionicons name="camera-outline" size={17} color={dark.text} />
              </TouchableOpacity>
            </View>
          )}

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

    <ImageViewer
      image={
        viewing && {
          uri: uriOf(viewing),
          title: viewingMine ? 'You' : viewing.uploadedBy?.name,
          caption: viewing.caption,
        }
      }
      onClose={() => setViewing(null)}
      onSave={() => saveOne(viewing)}
      saving={Boolean(viewing) && savingIds.has(viewing._id)}
      // Close first: the confirmation is a modal of its own.
      onDelete={
        viewingMine
          ? () => {
              const photo = viewing;
              setViewing(null);
              confirmDelete([photo]);
            }
          : undefined
      }
    />
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
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    borderRadius: 20,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    paddingHorizontal: spacing.sm + 4,
  },
  selectButtonText: { color: dark.text, fontSize: 12, fontWeight: '600' },
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

  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: GRID_PADDING,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
    backgroundColor: dark.card,
  },
  selectBarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCount: { flex: 1, color: dark.text, fontSize: 15, fontWeight: '700' },
  selectAll: {
    color: dark.accentGreen,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  disabled: { opacity: 0.4 },

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
  tileSelected: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,196,208,0.28)',
    borderWidth: 2,
    borderColor: dark.accentGreen,
    borderRadius: radius.md,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeOn: { backgroundColor: dark.accentGreen, borderColor: dark.accentGreen },
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
