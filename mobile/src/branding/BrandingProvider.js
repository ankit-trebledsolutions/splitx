import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { fetchBranding } from '../api/app.api';
import { API_ORIGIN } from '../api/client';

/**
 * How the app presents itself, as the owners set it in the admin panel
 * (General Settings > Branding): its name, its logo and where its invite
 * links point. Read from the server on every start and kept on the phone, so
 * the splash and sign-in screens draw the right name at once, offline too.
 * Until anything is known, and on a server from before branding existed,
 * the app is Splix with the Splix logo.
 *
 * The wordmark's lettering is Poppins ExtraBold (see BrandWordmark); the
 * font is loaded here so it is ready by the time the splash screen draws.
 */
export const DEFAULT_APP_NAME = 'Splix';

export const DEFAULT_BRANDING = {
  appName: DEFAULT_APP_NAME,
  logoUrl: null,
  // The server's own /join until it says otherwise: the same address the
  // app talks to, which is where the links are served from.
  inviteBaseUrl: `${API_ORIGIN}/join`,
};

const BRANDING_KEY = 'splix.branding';

const BrandingContext = createContext(null);

const sanitize = (raw) => ({
  appName: String(raw?.appName ?? '').trim() || DEFAULT_APP_NAME,
  logoUrl: typeof raw?.logoUrl === 'string' && /^https?:\/\//.test(raw.logoUrl) ? raw.logoUrl : null,
  inviteBaseUrl:
    typeof raw?.inviteBaseUrl === 'string' && /^https?:\/\//.test(raw.inviteBaseUrl)
      ? raw.inviteBaseUrl.replace(/\/+$/, '')
      : DEFAULT_BRANDING.inviteBaseUrl,
});

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [fontsLoaded] = useFonts({ Poppins_800ExtraBold });

  useEffect(() => {
    let active = true;
    // What was saved last time, then the server's current answer, which
    // replaces it for next time. Neither failing changes anything.
    AsyncStorage.getItem(BRANDING_KEY)
      .then((raw) => {
        if (active && raw) setBranding(sanitize(JSON.parse(raw)));
      })
      .catch(() => {});
    fetchBranding()
      .then((fresh) => {
        if (!active) return;
        const next = sanitize(fresh);
        setBranding(next);
        AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(next)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      ...branding,
      // The built-in wordmark is only right for the built-in name.
      isDefaultName: branding.appName.toLowerCase() === DEFAULT_APP_NAME.toLowerCase(),
      wordmarkFontReady: fontsLoaded,
    }),
    [branding, fontsLoaded]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

export const useBranding = () => {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
};
