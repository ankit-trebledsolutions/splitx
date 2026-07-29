import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Android emulators reach the host machine via 10.0.2.2.
// On a physical device, replace this with your machine's LAN IP.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

// Server origin (no /api/v1) — used to build absolute URLs for /uploads images.
export const API_ORIGIN = `http://${HOST}:4000`;

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
