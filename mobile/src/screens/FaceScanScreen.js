import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import ImageViewer from '../components/ImageViewer';
import AppAlert from '../components/AppAlert';
import { avatarColor } from '../components/Avatar';
import { scanFaces, fetchFaceScanStatus } from '../api/gallery.api';
import { absoluteUrl } from '../utils/attachments';
import { savePhotoToGallery, SavePermissionError } from '../utils/saveToGallery';
import { initials } from '../utils/format';
import { radius, spacing, useStyles, useTheme } from '../theme';

const NUM_COLUMNS = 3;
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
// The face chooser's squares, and the one above the results.
const FACE_SIZE = 64;
const PREVIEW_SIZE = 72;
// While the server still has photos to scan, how often to ask if it is done.
const STATUS_POLL_MS = 5000;
// Matches the server's upload limit.
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// The picked asset as the upload wants it.
const fileOf = (asset) => ({
  uri: asset.uri,
  name: asset.fileName ?? `face-${Date.now()}.jpg`,
  type: asset.mimeType ?? 'image/jpeg',
});

// What the server's refusals mean to the person; anything else as it came.
const messageFor = (err) => {
  switch (err.code) {
    case 'FACE_NOT_FOUND':
      return 'No face was found in that picture. Try a clearer, front-facing one.';
    case 'FACE_SCAN_UNREADABLE':
      return 'That picture could not be read. Try another one.';
    case 'FACE_SCAN_UNAVAILABLE':
      return 'Face Scan is not available right now. Try again in a little while.';
    case 'FACE_SCAN_RATE_LIMITED':
      return 'Too many scans. Try again in a few minutes.';
    default:
      return err.message || 'Something went wrong. Try again.';
  }
};

/**
 * A square showing one face out of the scanned picture. The server says
 * where the face is (`box`: x1, y1, x2, y2 as fractions of the picture, which
 * is `width` x `height` the right way up), so the picture is drawn at the
 * scale that makes the face fill the square, shifted so the face sits in the
 * middle, and the square clips the rest.
 */
const FaceCrop = ({ uri, width, height, box, size, style }) => {
  if (!width || !height || !box) {
    return <Image source={{ uri }} style={[{ width: size, height: size }, style]} resizeMode="cover" />;
  }
  const [x1, y1, x2, y2] = box;
  const faceWidth = (x2 - x1) * width;
  const faceHeight = (y2 - y1) * height;
  // The face plus a little room around it fills the square.
  const span = Math.max(faceWidth, faceHeight, 1) * 1.7;
  const scale = size / span;
  const left = size / 2 - ((x1 + x2) / 2) * width * scale;
  const top = size / 2 - ((y1 + y2) / 2) * height * scale;
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <Image
        source={{ uri }}
        style={{ position: 'absolute', left, top, width: width * scale, height: height * scale }}
        resizeMode="stretch"
      />
    </View>
  );
};

/**
 * Face Scan: take a selfie or pick a picture of anyone, and see the photos in
 * this group's gallery that show the same person. The server fingerprints the
 * faces in the picture and compares them with the fingerprints it kept when
 * each gallery photo was uploaded; the picture itself is not kept.
 *
 * With several faces in the picture, a row of them lets the person choose
 * whose photos to see. While the server still has new photos to scan, the
 * screen says so and scans again by itself once it has finished.
 */
const FaceScanScreen = ({ route, navigation }) => {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const { groupId, groupName } = route.params;
  const { width: windowWidth } = useWindowDimensions();
  const tileSize = Math.floor(
    (windowWidth - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
  );

  // pick (choose a picture) → scanning → results
  const [phase, setPhase] = useState('pick');
  const [picked, setPicked] = useState(null); // { uri, file }
  const [result, setResult] = useState(null); // the server's answer
  const [faceIndex, setFaceIndex] = useState(0);
  const [error, setError] = useState(null);
  const [rescanning, setRescanning] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  // `quiet`: a scan repeated after the server caught up on new photos; the
  // results already on screen stay until the new ones arrive.
  const scan = useCallback(
    async (file, { quiet = false } = {}) => {
      setError(null);
      if (quiet) setRescanning(true);
      else {
        setPhase('scanning');
        setResult(null);
        setFaceIndex(0);
      }
      try {
        const data = await scanFaces(groupId, file);
        if (!alive.current) return;
        setResult(data);
        setFaceIndex((index) => Math.min(index, Math.max(0, data.faces.length - 1)));
        setPhase('results');
      } catch (err) {
        if (!alive.current || quiet) return;
        setPhase('pick');
        setError(messageFor(err));
      } finally {
        if (alive.current) setRescanning(false);
      }
    },
    [groupId]
  );

  const scanAsset = (asset) => {
    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      AppAlert.alert('Picture too large', 'Pick a picture under 10MB.');
      return;
    }
    const file = fileOf(asset);
    setPicked({ uri: asset.uri, file });
    scan(file);
  };

  const takeSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      AppAlert.alert('Camera needed', 'Allow camera access to scan a face.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      quality: 0.8,
    });
    if (!shot.canceled) scanAsset(shot.assets[0]);
  };

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      AppAlert.alert('Permission needed', 'Allow photo library access to pick a picture.');
      return;
    }
    const chosen = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!chosen.canceled) scanAsset(chosen.assets[0]);
  };

  const startOver = () => {
    setPhase('pick');
    setResult(null);
    setPicked(null);
    setError(null);
    setFaceIndex(0);
  };

  // New photos the server has not scanned yet cannot be in the results. Ask
  // now and then whether it has caught up, and scan again when it has.
  const pending = result?.pending ?? 0;
  useEffect(() => {
    if (phase !== 'results' || !pending || !picked) return undefined;
    const timer = setInterval(async () => {
      try {
        const status = await fetchFaceScanStatus(groupId);
        if (!alive.current) return;
        if (status.pending === 0) scan(picked.file, { quiet: true });
        else setResult((prev) => (prev ? { ...prev, pending: status.pending } : prev));
      } catch {
        // Asked again at the next tick.
      }
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, pending, picked, groupId, scan]);

  const saveViewing = async () => {
    if (!viewing) return;
    setSaving(true);
    try {
      await savePhotoToGallery(viewing._id, absoluteUrl(viewing.imageUrl));
      AppAlert.alert('Saved to your phone', 'The photo is in your phone’s gallery now.');
    } catch (err) {
      if (err instanceof SavePermissionError) {
        AppAlert.alert('Allow photo access', 'Splix needs permission to add photos to your gallery.');
      } else {
        AppAlert.alert('Could not save photo', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={navigation.goBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={18} color={theme.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Face Scan</Text>
      <View style={styles.backButtonGhost} />
    </View>
  );

  if (phase !== 'results') {
    const scanning = phase === 'scanning';
    return (
      <DarkScreen>
        {header}
        <View style={styles.pickBody}>
          <View style={styles.hero}>
            {scanning && picked ? (
              <Image source={{ uri: picked.uri }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <Ionicons name="scan-outline" size={40} color={theme.stay} />
            )}
          </View>
          {scanning ? (
            <>
              <ActivityIndicator color={theme.stay} style={styles.spinner} />
              <Text style={styles.title}>Looking for this face…</Text>
              <Text style={styles.body}>Checking the photos in {groupName ?? 'this group'}.</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Find the photos someone is in</Text>
              <Text style={styles.body}>
                Take a selfie, or pick a picture of anyone in the group. Only this group’s gallery
                is searched, and the picture you scan is not kept.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <GradientButton title="Take a selfie" onPress={takeSelfie} glow style={styles.primary} />
              <TouchableOpacity style={styles.secondary} activeOpacity={0.8} onPress={choosePhoto}>
                <Ionicons name="images-outline" size={16} color={theme.text} />
                <Text style={styles.secondaryText}>Choose a photo</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </DarkScreen>
    );
  }

  const faces = result?.faces ?? [];
  const face = faces[faceIndex] ?? null;
  const matches = face?.matches ?? [];

  const renderMatch = ({ item }) => {
    const { photo } = item;
    const thumb = absoluteUrl(photo.thumbUrl) ?? absoluteUrl(photo.imageUrl);
    const uploaderName = photo.uploadedBy?.name ?? '';
    return (
      <TouchableOpacity
        style={[styles.tile, { width: tileSize, height: tileSize }]}
        activeOpacity={0.85}
        onPress={() => setViewing(photo)}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        {uploaderName ? (
          <View style={[styles.uploaderChip, { backgroundColor: avatarColor(uploaderName) }]}>
            <Text style={styles.uploaderChipText}>{initials(uploaderName)}</Text>
          </View>
        ) : null}
        <View style={styles.matchChip}>
          <Text style={styles.matchChipText}>{Math.round(item.similarity * 100)}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.pickedCard}>
        {picked && face ? (
          <FaceCrop
            uri={picked.uri}
            width={result.width}
            height={result.height}
            box={face.box}
            size={PREVIEW_SIZE}
            style={styles.pickedFace}
          />
        ) : null}
        <View style={styles.pickedBody}>
          <Text style={styles.pickedTitle}>
            {faces.length > 1 ? `${faces.length} faces in your picture` : 'Face found'}
          </Text>
          <Text style={styles.pickedMeta}>
            {matches.length === 1 ? '1 photo' : `${matches.length} photos`} in{' '}
            {groupName ?? 'this group'}
            {rescanning ? ' · updating…' : ''}
          </Text>
        </View>
      </View>

      {faces.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.faceRow}>
          {faces.map((other, index) => (
            <TouchableOpacity
              // Faces have no id of their own; their order is fixed for one scan.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              activeOpacity={0.8}
              onPress={() => setFaceIndex(index)}
              style={[styles.faceChoice, index === faceIndex && styles.faceChoiceActive]}
            >
              <FaceCrop
                uri={picked.uri}
                width={result.width}
                height={result.height}
                box={other.box}
                size={FACE_SIZE}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {pending > 0 && (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={theme.stay} />
          <Text style={styles.pendingText}>
            Still scanning {pending} new {pending === 1 ? 'photo' : 'photos'}… the results will
            update by themselves.
          </Text>
        </View>
      )}
    </View>
  );

  const viewed = viewing && {
    uri: absoluteUrl(viewing.imageUrl),
    title: viewing.uploadedBy?.name ?? 'Photo',
    caption: viewing.caption,
  };

  return (
    <DarkScreen>
      {header}
      <FlatList
        data={matches}
        key={NUM_COLUMNS}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.photo._id}
        renderItem={renderMatch}
        extraData={faceIndex}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No photos with this face yet.
            {pending ? '' : ' Try a clearer picture, or a different face.'}
          </Text>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondary} activeOpacity={0.8} onPress={startOver}>
          <Ionicons name="scan-outline" size={16} color={theme.text} />
          <Text style={styles.secondaryText}>Scan another face</Text>
        </TouchableOpacity>
      </View>

      <ImageViewer image={viewed} onClose={() => setViewing(null)} onSave={saveViewing} saving={saving} />
    </DarkScreen>
  );
};

const makeStyles = (theme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGhost: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },

  pickBody: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + spacing.md,
  },
  hero: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(183,156,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(183,156,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  heroImage: { width: 96, height: 96 },
  spinner: { marginBottom: spacing.md },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  error: {
    color: theme.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primary: { alignSelf: 'stretch', marginBottom: spacing.md },
  secondary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryText: { color: theme.text, fontSize: 14, fontWeight: '700' },

  list: { paddingHorizontal: GRID_PADDING, paddingBottom: 120 },
  pickedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  pickedFace: { borderRadius: radius.md, backgroundColor: theme.overlay },
  pickedBody: { flex: 1 },
  pickedTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  pickedMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },

  faceRow: { marginBottom: spacing.md },
  faceChoice: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: spacing.sm,
    opacity: 0.55,
  },
  faceChoiceActive: { borderColor: theme.stay, opacity: 1 },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(183,156,255,0.10)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  pendingText: { flex: 1, color: theme.textSoft, fontSize: 12, lineHeight: 17 },

  empty: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: {
    borderRadius: radius.md,
    backgroundColor: theme.overlay,
    overflow: 'hidden',
  },
  uploaderChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  uploaderChipText: { color: '#0B1116', fontSize: 8, fontWeight: '800' },
  matchChip: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  matchChipText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },

  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});

export default FaceScanScreen;
