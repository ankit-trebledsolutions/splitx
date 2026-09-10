import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Production builds (the APK) talk to the deployed API.
const PROD_ORIGIN = 'https://splitx-dj1h.onrender.com';

// Development (Expo Go) talks to the backend on this machine.
// Android emulators reach the host via 10.0.2.2; on a physical device,
// replace this with your machine's LAN IP (e.g. 192.168.1.9).
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

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
