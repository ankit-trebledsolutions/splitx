import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';

// Photo ids this device has already saved, so the gallery can show a tick
// instead of the download icon. Per device by design: a new phone starts clean.
const SAVED_KEY = 'splix.savedPhotos';

export const loadSavedPhotoIds = async () => {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const rememberSaved = async (photoId) => {
  const ids = await loadSavedPhotoIds();
  ids.add(photoId);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
};

export class SavePermissionError extends Error {
  constructor(canAskAgain) {
    super('Photo access was not granted');
    this.canAskAgain = canAskAgain;
  }
}

const extensionOf = (url) => {
  const match = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(url);
  return match ? match[1].toLowerCase() : 'jpg';
};

/**
 * Downloads a gallery photo and puts it in the phone's own photo library, the
 * way WhatsApp does. Only "add photos" access is requested, never read access
 * to the person's library. Throws SavePermissionError if that is refused.
 */
export const savePhotoToGallery = async (photoId, imageUri) => {
  // A phone still on a build from before this module was added has no native
  // half for it. Check first: a failing require() is reported by Metro as a
  // fatal red screen and cannot be caught, so try/catch is not enough.
  if (!requireOptionalNativeModule('ExpoMediaLibrary')) {
    throw new Error('Install the latest build of Splix to save photos to your phone.');
  }
  const MediaLibrary = require('expo-media-library');

  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) throw new SavePermissionError(permission.canAskAgain);

  // Stage the download in the cache; the media library copies it from there.
  const staging = new Directory(Paths.cache, 'gallery-downloads');
  staging.create({ intermediates: true, idempotent: true });
  const target = new File(staging, `splix-${photoId}.${extensionOf(imageUri)}`);

  // idempotent: a leftover file from an interrupted download is overwritten.
  const downloaded = await File.downloadFileAsync(imageUri, target, { idempotent: true });
  try {
    await MediaLibrary.saveToLibraryAsync(downloaded.uri);
  } finally {
    if (downloaded.exists) downloaded.delete();
  }
  await rememberSaved(photoId);
};
