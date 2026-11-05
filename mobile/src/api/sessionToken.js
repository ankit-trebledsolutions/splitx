import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

/**
 * Where the session token (the JWT that every request is signed with) is kept.
 *
 * In the phone's secure storage (expo-secure-store: encrypted with a key held
 * by the Android Keystore, or in the iOS Keychain), not in AsyncStorage, which
 * is a plain file that a backup, a rooted phone or a debugging cable can read.
 *
 * A build from before secure storage was added has no such native module, and
 * requiring one that is missing cannot be caught. There the token stays in
 * AsyncStorage, exactly as before, until the new build is installed.
 *
 * Moving in: a token that an older build left in AsyncStorage is moved into
 * secure storage the first time it is read. Nobody is signed out by it: when
 * the move fails, the token is used from where it is and moved on a later
 * start instead.
 *
 * Read once, then kept in memory: every request asks for it.
 */
const KEY = 'splity.token';

const SecureStore = requireOptionalNativeModule('ExpoSecureStore') ? require('expo-secure-store') : null;

// iOS: readable while locked (a reminder push is handled in the background),
// and never carried to another phone by a backup. Android ignores it; there the
// Keystore key is usable while locked and never leaves the phone either.
const OPTIONS = SecureStore ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY } : {};

// undefined: not read yet. null: nobody is signed in.
let cached;
let reading = null;
// Bumped by every save and clear. A read that was already under way at that
// moment has an older answer, and must not replace the newer one.
let generation = 0;

// Storage is touched one step at a time, in the order asked: a move still
// under way must not land after a newer sign-in or sign-out.
let queue = Promise.resolve();
const inTurn = (task) => {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
};

const readStored = async () => {
  // Only ever written by an older build, or when secure storage refused a
  // token (see setToken). A successful save removes it, so whenever there is
  // one it is the newest token this phone has.
  const unmoved = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!SecureStore) return unmoved;

  if (unmoved) {
    try {
      await SecureStore.setItemAsync(KEY, unmoved, OPTIONS);
      await AsyncStorage.removeItem(KEY);
    } catch (err) {
      console.warn('Session token not moved to secure storage yet:', err.message);
    }
    return unmoved;
  }

  try {
    return await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch (err) {
    // Secure storage could not read it back: there is no token to send, so
    // this phone is signed out.
    console.warn('Session token could not be read:', err.message);
    return null;
  }
};

export const getToken = () => {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!reading) {
    const startedIn = generation;
    reading = inTurn(readStored)
      .catch(() => null)
      .then((token) => {
        if (startedIn === generation) cached = token;
        // Otherwise a save or clear has already said what is current.
        return cached;
      });
  }
  return reading;
};

const saveStored = async (token) => {
  if (!SecureStore) {
    await AsyncStorage.setItem(KEY, token);
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, token, OPTIONS);
  } catch (err) {
    // Refused by secure storage (a broken keystore on some phones). Being able
    // to sign in at all matters more: the token goes where older builds kept
    // it, and is moved on a later start.
    console.warn('Session token kept outside secure storage:', err.message);
    await AsyncStorage.setItem(KEY, token);
    return;
  }
  // An older build's copy, or one left by a refused save.
  await AsyncStorage.removeItem(KEY).catch(() => {});
};

const clearStored = () =>
  // Both places, whichever this phone used.
  Promise.all([
    AsyncStorage.removeItem(KEY),
    SecureStore ? SecureStore.deleteItemAsync(KEY, OPTIONS) : null,
  ]);

export const setToken = (token) => {
  generation += 1;
  cached = token;
  return inTurn(() => saveStored(token));
};

export const clearToken = () => {
  generation += 1;
  cached = null;
  return inTurn(clearStored);
};

export const hasToken = async () => Boolean(await getToken());
