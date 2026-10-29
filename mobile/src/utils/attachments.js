import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { API_ORIGIN } from '../api/client';

// Matches the server's upload limit.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PER_PICK = 10;

// Absolute URLs (https://…) are used as-is; /uploads/… is relative to the API origin.
export const absoluteUrl = (url) =>
  url ? (url.startsWith('http') ? url : `${API_ORIGIN}${url}`) : null;

// "840 KB" / "2.4 MB"
export const prettyBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// "0:07" / "12:40"
export const formatDuration = (ms = 0) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// One line standing in for a message: the quote above a reply, the "replying
// to" bar, the long-press sheet.
export const messageSnippet = (message) => {
  if (!message) return '';
  if (message.deletedAt) return 'This message was deleted';
  if (message.text) return message.text;
  if (message.type === 'image') return '📷 Photo';
  if (message.type === 'audio') {
    const length = message.attachment?.durationMs;
    return length ? `🎤 Voice note (${formatDuration(length)})` : '🎤 Voice note';
  }
  if (message.type === 'file') return `📄 ${message.attachment?.name || 'Document'}`;
  return '';
};

// A phone still on a build from before these modules were added has no native
// half for them. Check first: a failing require() is reported by Metro as a
// fatal red screen and cannot be caught, so try/catch is not enough.
const OUTDATED_BUILD = 'Install the latest build of Splix to use this.';
export const canUseVoiceNotes = () => Boolean(requireOptionalNativeModule('ExpoAudio'));

export class PickerPermissionError extends Error {}

// Drops anything over the upload limit; `skipped` says how many that was.
const withinLimit = (files) => {
  const kept = files.filter((f) => !f.size || f.size <= MAX_ATTACHMENT_BYTES);
  return { files: kept, skipped: files.length - kept.length };
};

/** Photos from the phone's library, as [{ uri, name, type, size }]. */
export const pickChatPhotos = async () => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PickerPermissionError('Allow photo library access to send pictures.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_PER_PICK,
    quality: 0.8,
  });
  if (result.canceled) return { files: [], skipped: 0 };

  return withinLimit(
    result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}-${index}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
    }))
  );
};

/** Any files from the phone (PDFs, docs, audio…), as [{ uri, name, type, size }]. */
export const pickChatDocuments = async () => {
  if (!requireOptionalNativeModule('ExpoDocumentPicker')) throw new Error(OUTDATED_BUILD);
  const DocumentPicker = require('expo-document-picker');

  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    // The upload reads the file from the app's cache; a content:// uri can't be sent.
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { files: [], skipped: 0 };

  const picked = withinLimit(
    result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name || `file-${Date.now()}`,
      type: asset.mimeType || 'application/octet-stream',
      size: asset.size ?? null,
    }))
  );
  return { files: picked.files.slice(0, MAX_PER_PICK), skipped: picked.skipped };
};
