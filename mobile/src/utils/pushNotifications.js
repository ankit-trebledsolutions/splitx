import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushToken, removePushToken } from '../api/notifications.api';
import { routeForNotification } from './notificationRoute';
import { dark } from '../theme';

// Remembered so logout can unregister this device without asking Expo again.
const PUSH_TOKEN_KEY = 'splix.pushToken';

// Show pushes as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ensurePermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
};

/**
 * Asks for permission, fetches this device's Expo push token and hands it to
 * the backend. Best-effort: emulators, denied permission and offline starts
 * simply leave the device without pushes until the next login/app start.
 */
export const registerForPush = async () => {
  try {
    if (Platform.OS === 'android') {
      // Must exist before the permission prompt on Android 13+. The backend
      // sends every push to this "default" channel.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Group activity',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: dark.accentGreen,
      });
    }

    if (!(await ensurePermission())) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await registerPushToken(token);
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch (err) {
    console.warn('Push registration skipped:', err.message);
  }
};

// Call while the auth token is still valid, i.e. before clearing the session.
export const unregisterFromPush = async () => {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    await removePushToken(token);
  } catch {
    // Offline logout: the backend reassigns the token on the next login anyway.
  }
};

// Where tapping a push should land. A push is treated as the notification it
// mirrors (its `data` plus the visible title and body), so it goes exactly
// where tapping the same entry in the in-app list would.
export const routeForPush = (content = {}) =>
  routeForNotification({
    ...content.data,
    title: content.title,
    body: content.body,
    createdAt: new Date().toISOString(),
  }) ?? ['Notifications'];
