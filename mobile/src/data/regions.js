import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCountries, fetchStates } from '../api/places.api';

/**
 * The country and state lists behind the destination fields, kept on the
 * phone so the dropdown opens at once. Each list is read from memory, then
 * from storage, then from the server; a stored copy is used straight away
 * and refreshed from the server once per app session, in the background.
 */
const VERSION = 'v1';
const keyFor = (name) => `regions:${VERSION}:${name}`;

const memory = new Map();
const refreshed = new Set();

const store = (key, list) => {
  memory.set(key, list);
  AsyncStorage.setItem(key, JSON.stringify(list)).catch(() => {});
};

const refreshOnce = (key, load) => {
  if (refreshed.has(key)) return;
  refreshed.add(key);
  load()
    .then((list) => store(key, list))
    .catch(() => {});
};

const remember = async (name, load) => {
  const key = keyFor(name);
  if (memory.has(key)) return memory.get(key);

  const stored = await AsyncStorage.getItem(key).catch(() => null);
  if (stored) {
    try {
      const list = JSON.parse(stored);
      if (Array.isArray(list)) {
        memory.set(key, list);
        refreshOnce(key, load);
        return list;
      }
    } catch {
      // A damaged copy: fetched afresh below.
    }
  }

  const list = await load();
  refreshed.add(key);
  store(key, list);
  return list;
};

export const loadCountries = () => remember('countries', fetchCountries);

export const loadStates = (countryCode) => remember(`states:${countryCode}`, () => fetchStates(countryCode));
