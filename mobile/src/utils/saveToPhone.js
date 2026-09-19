import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

// Voice notes and documents can't go into the phone's photo gallery the way
// pictures do (see saveToGallery): it only takes images and video. On Android
// they are written to a folder the person picks once (say Download/Splix);
// Android remembers that permission, so later saves go there without asking.
const FOLDER_KEY = 'splix.saveFolder';
// Message ids this device has already saved, so the bubble can show a tick.
const SAVED_KEY = 'splix.savedFiles';

export const loadSavedFileIds = async () => {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const rememberSaved = async (messageId) => {
  const ids = await loadSavedFileIds();
  ids.add(messageId);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...ids]));
};

// The person backed out of the folder picker: nothing to report.
export class SaveCancelledError extends Error {}

// Android refuses the top of the phone's storage ("Can't use this folder"), so
// open the picker inside Documents, where "Use this folder" works straight away.
const START_IN = 'content://com.android.externalstorage.documents/document/primary%3ADocuments';

const pickFolder = async () => {
  let folder;
  try {
    folder = await Directory.pickDirectoryAsync(START_IN);
  } catch {
    throw new SaveCancelledError('No folder chosen');
  }
  await AsyncStorage.setItem(FOLDER_KEY, folder.uri);
  return folder;
};

const safeName = (name, fallback) =>
  (name || fallback).replace(/[\\/:*?"<>|]/g, '_').slice(-120);

// The chosen folder is a content:// tree, which File.copy() can't write into,
// so the bytes are written to a file created there instead.
const writeInto = (folder, name, mimeType, bytes) => {
  const target = folder.createFile(name, mimeType || null);
  target.write(bytes);
  return target;
};

/**
 * Downloads a chat attachment and keeps a copy on the phone. `attachment` is
 * the message's { name, mimeType }; `url` must be absolute. Throws
 * SaveCancelledError if no folder was picked.
 */
export const saveFileToPhone = async (messageId, url, attachment = {}) => {
  const name = safeName(attachment.name, `splix-${messageId}`);

  // Stage the download in the cache first, as saveToGallery does.
  const staging = new Directory(Paths.cache, 'chat-downloads');
  staging.create({ intermediates: true, idempotent: true });
  const downloaded = await File.downloadFileAsync(url, new File(staging, `${messageId}-${name}`), {
    idempotent: true,
  });

  try {
    if (Platform.OS !== 'android') {
      // iOS keeps them in the app's own Documents/Splix folder.
      const folder = new Directory(Paths.document, 'Splix');
      folder.create({ intermediates: true, idempotent: true });
      const target = new File(folder, name);
      if (target.exists) target.delete();
      downloaded.copy(target);
      await rememberSaved(messageId);
      return;
    }

    const bytes = await downloaded.bytes();
    const savedUri = await AsyncStorage.getItem(FOLDER_KEY);
    let folder = savedUri ? new Directory(savedUri) : await pickFolder();
    try {
      writeInto(folder, name, attachment.mimeType, bytes);
    } catch (err) {
      // The remembered folder was deleted or its permission withdrawn: ask once more.
      if (!savedUri) throw err;
      await AsyncStorage.removeItem(FOLDER_KEY);
      folder = await pickFolder();
      writeInto(folder, name, attachment.mimeType, bytes);
    }
    await rememberSaved(messageId);
  } finally {
    if (downloaded.exists) downloaded.delete();
  }
};
