import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dark, light } from './palettes';

// Android draws the app under the system navigation bar (edge-to-edge), so
// only the bar's button icons need to follow the theme: light on dark, dark
// on light. expo-navigation-bar is native: a build from before it was added
// has no module, and a failing require() red-screens in Metro, so check first
// (the convention in utils/attachments.js). iOS has no such bar.
const navigationBar = () =>
  Platform.OS === 'android' && requireOptionalNativeModule('ExpoNavigationBar')
    ? require('expo-navigation-bar')
    : null;

const applyNavigationBar = (theme) => {
  const bar = navigationBar();
  if (!bar) return;
  bar.setButtonStyleAsync(theme.isDark ? 'light' : 'dark').catch(() => {
    // Best effort: gesture navigation has no buttons to recolour.
  });
};

// Which look the app wears: the dark one it always had (the default), the
// light one, or whichever the phone is set to. Profile → Appearance sets it;
// the choice is kept on the phone and read back on the next launch.
export const THEME_MODES = [
  { key: 'dark', label: 'Dark', hint: 'The original Splix look' },
  { key: 'light', label: 'Light', hint: 'White cards on a soft grey base' },
  { key: 'system', label: 'Match system', hint: 'Follow the phone’s setting' },
];

const STORAGE_KEY = 'splix.themeMode';
const DEFAULT_MODE = 'dark';
const isMode = (value) => THEME_MODES.some((m) => m.key === value);

const ThemeContext = createContext({ theme: dark, mode: DEFAULT_MODE, setMode: () => {} });

export const ThemeProvider = ({ children }) => {
  const [mode, setModeState] = useState(DEFAULT_MODE);
  const system = useColorScheme();

  // The saved choice arrives a moment after launch; until then the app shows
  // the default, which the splash screen covers.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (active && isMode(saved)) setModeState(saved);
      })
      .catch(() => {
        // Unreadable storage: stay on the default.
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next) => {
    if (!isMode(next)) return;
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Not saved: the choice still holds until the app is closed.
    });
  }, []);

  const theme = mode === 'light' || (mode === 'system' && system === 'light') ? light : dark;

  useEffect(() => {
    applyNavigationBar(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, mode, setMode }), [theme, mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// The active palette.
export const useTheme = () => useContext(ThemeContext).theme;

// The chosen mode and its setter, for the Appearance control.
export const useThemeMode = () => {
  const { theme, mode, setMode } = useContext(ThemeContext);
  return { mode, setMode, isDark: theme.isDark };
};

// Styles built from the active palette. `factory` is a `(theme) =>
// StyleSheet.create({...})` defined once per file; its result is cached per
// palette, so every instance of a component shares one style object and the
// sheet is only rebuilt when the theme changes.
const cache = new WeakMap();
export const useStyles = (factory) => {
  const theme = useTheme();
  let byTheme = cache.get(factory);
  if (!byTheme) {
    byTheme = new Map();
    cache.set(factory, byTheme);
  }
  let styles = byTheme.get(theme);
  if (!styles) {
    styles = factory(theme);
    byTheme.set(theme, styles);
  }
  return styles;
};
