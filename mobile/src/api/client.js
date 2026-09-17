import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Production builds (the APK) talk to the deployed API.
const PROD_ORIGIN = 'https://splitx-dj1h.onrender.com';

// The Android emulator can't use "localhost" to mean the host machine; it has
// a fixed alias for it instead. A physical phone reached over USB with
// `adb reverse` really does use localhost.
const EMULATOR_HOST_ALIAS = '10.0.2.2';
const isAndroidEmulator = () => {
  if (Platform.OS !== 'android') return false;
  const { Model = '', Fingerprint = '', Brand = '' } = Platform.constants ?? {};
  return (
    /sdk_gphone|emulator|android sdk built for|generic/i.test(`${Model} ${Fingerprint}`) ||
    (Brand === 'google' && /^sdk/i.test(Model))
  );
};

// Development talks to the backend on the same machine that serves Metro.
// Expo tells us that machine's address (`hostUri`, e.g. "192.168.1.9:8081"),
// so a phone on the same Wi-Fi finds the backend automatically with no IP to
// edit. Over a loopback address (adb reverse) the emulator needs its host
// alias, while a real phone keeps localhost (with `adb reverse tcp:4000` set).
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
const isLoopback = !metroHost || metroHost === 'localhost' || metroHost === '127.0.0.1';
const loopbackHost = isAndroidEmulator() ? EMULATOR_HOST_ALIAS : 'localhost';
const DEV_HOST = isLoopback ? loopbackHost : metroHost;

// Server origin (no /api/v1) — used to build absolute URLs for /uploads images.
export const API_ORIGIN = __DEV__ ? `http://${DEV_HOST}:4000` : PROD_ORIGIN;

export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

export const TOKEN_KEY = 'splity.token';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default client;
