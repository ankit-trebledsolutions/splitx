import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DarkScreen from '../components/DarkScreen';
import GradientButton from '../components/GradientButton';
import { uploadPhotoFile } from '../api/gallery.api';
import { dark, radius, spacing } from '../theme';

const MAX_BYTES = 15 * 1024 * 1024;

const prettySize = (bytes) =>
  bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '';

// Pick images from the device and upload them to the group gallery with
// per-file progress, per the upload-photos mockup.
const UploadPhotosScreen = ({ route, navigation }) => {
  const { groupId, groupName } = route.params;
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled) return;

    const picked = result.assets
      .filter((asset) => !asset.fileSize || asset.fileSize <= MAX_BYTES)
      .map((asset, index) => ({
        id: `${Date.now()}-${index}`,
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}-${index}.jpg`,
        size: asset.fileSize ?? null,
        type: asset.mimeType ?? 'image/jpeg',
        progress: 0,
        status: 'pending',
      }));

    if (picked.length < result.assets.length) {
      Alert.alert('Some photos skipped', 'Files over 15MB were left out.');
    }
    setFiles((prev) => [...prev, ...picked]);
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const patchFile = (id, patch) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const pending = files.filter((f) => f.status !== 'done');
  const totalProgress = files.length
    ? files.reduce((sum, f) => sum + (f.status === 'done' ? 1 : f.progress), 0) / files.length
    : 0;

  const uploadAll = async () => {
    if (!pending.length) return;
    setUploading(true);
    let failed = 0;

    for (const file of pending) {
      patchFile(file.id, { status: 'uploading' });
      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadPhotoFile(
          groupId,
          { uri: file.uri, name: file.name, type: file.type },
          '',
          (progress) => patchFile(file.id, { progress })
        );
        patchFile(file.id, { status: 'done', progress: 1 });
      } catch {
        failed += 1;
        patchFile(file.id, { status: 'error', progress: 0 });
      }
    }

    setUploading(false);
    if (failed) {
      Alert.alert('Upload finished', `${failed} photo${failed === 1 ? '' : 's'} failed — try again.`);
    } else {
      Alert.alert('Uploaded!', 'Your photos are in the group gallery.', [
        { text: 'OK', onPress: navigation.goBack },
      ]);
    }
  };

  return (
    <DarkScreen>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={navigation.goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={dark.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload Photos</Text>
        <View style={styles.backButtonGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.groupCard}>
          <Text style={styles.groupFlag}>🖼️</Text>
          <View>
            <Text style={styles.groupName}>{groupName ?? 'Group'}</Text>
            <Text style={styles.groupMeta}>Adding to shared gallery</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.dropZone} activeOpacity={0.8} onPress={pickImages}>
          <View style={styles.dropIcon}>
            <Ionicons name="cloud-upload-outline" size={24} color={dark.accentGreen} />
          </View>
          <Text style={styles.dropTitle}>Tap to browse your photos</Text>
          <Text style={styles.dropMeta}>Supports JPG, PNG, HEIC (Max 15MB)</Text>
        </TouchableOpacity>

        {files.length > 0 && (
          <>
            <View style={styles.uploadHeader}>
              <Text style={styles.uploadLabel}>
                {uploading ? 'UPLOADING' : 'READY'} ({files.length} FILE{files.length === 1 ? '' : 'S'})
              </Text>
              <Text style={styles.uploadTotal}>{Math.round(totalProgress * 100)}% Total</Text>
            </View>

            {files.map((file) => (
              <View key={file.id} style={styles.fileRow}>
                <Image source={{ uri: file.uri }} style={styles.thumb} />
                <View style={styles.fileBody}>
                  <View style={styles.fileTop}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.filePercent}>
                      {file.status === 'error' ? 'Failed' : `${Math.round(file.progress * 100)}%`}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(file.progress * 100)}%` },
                        file.status === 'error' && styles.progressError,
                      ]}
                    />
                  </View>
                  <Text style={styles.fileMeta}>
                    {[prettySize(file.size), file.status === 'uploading' ? 'Uploading…' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {file.status !== 'uploading' && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    activeOpacity={0.8}
                    onPress={() => removeFile(file.id)}
                  >
                    <Ionicons name="close" size={13} color={dark.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {pending.length > 0 && (
        <View style={styles.footer}>
          <GradientButton
            title={`Upload ${pending.length} Photo${pending.length === 1 ? '' : 's'}`}
            onPress={uploadAll}
            loading={uploading}
          />
        </View>
      )}
    </DarkScreen>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGhost: { width: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: dark.text,
    fontSize: 18,
    fontWeight: '800',
  },

  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  groupFlag: { fontSize: 18 },
  groupName: { color: dark.text, fontSize: 14, fontWeight: '700' },
  groupMeta: { color: dark.textMuted, fontSize: 11, marginTop: 1 },

  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(23,230,149,0.35)',
    borderRadius: radius.lg + 4,
    alignItems: 'center',
    paddingVertical: spacing.xl + 8,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  dropIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(23,230,149,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dropTitle: { color: dark.text, fontSize: 15, fontWeight: '700' },
  dropMeta: { color: dark.textMuted, fontSize: 11, marginTop: 4 },

  uploadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  uploadLabel: { color: dark.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  uploadTotal: { color: dark.accentGreen, fontSize: 11, fontWeight: '700' },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.card,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  thumb: { width: 38, height: 38, borderRadius: 8, marginRight: spacing.sm + 2 },
  fileBody: { flex: 1, marginRight: spacing.sm },
  fileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fileName: { flex: 1, color: dark.text, fontSize: 12, fontWeight: '600', marginRight: spacing.sm },
  filePercent: { color: dark.textMuted, fontSize: 11, fontWeight: '700' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: dark.accentGreen,
  },
  progressError: { backgroundColor: '#F87171' },
  fileMeta: { color: dark.textMuted, fontSize: 10, marginTop: 4 },
  removeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
});

export default UploadPhotosScreen;
