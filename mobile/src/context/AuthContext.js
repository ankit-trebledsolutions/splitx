import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY, setAccountSuspendedHandler } from '../api/client';
import {
  loginRequest,
  registerRequest,
  verifyEmailRequest,
  meRequest,
  googleLoginRequest,
} from '../api/auth.api';
import { signInWithGoogle, signOutOfGoogle } from '../utils/googleSignIn';
import { unregisterFromPush } from '../utils/pushNotifications';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Why the session ended, when it was not the person's own doing. Survives the
  // trip back to the sign-in screen so they are told what happened instead of
  // finding themselves logged out for no visible reason.
  const [suspendedNotice, setSuspendedNotice] = useState(null);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (token) {
          const { user: me } = await meRequest();
          setUser(me);
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: loggedIn, token } = await loginRequest({ email, password });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(loggedIn);
  }, []);

  // Creates the account and emails a code. There is no session yet: that comes
  // from verifyEmail once the code is entered. Resolves to { email, retryAfter, devOtp? }.
  const register = useCallback(
    (name, email, password) => registerRequest({ name, email, password }),
    []
  );

  // Entering the right code finishes sign-up and logs the person in.
  const verifyEmail = useCallback(async (email, otp) => {
    const { user: verified, token } = await verifyEmailRequest(email, otp);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(verified);
  }, []);

  // Google covers both sign-up and log-in: the backend finds the account by
  // Google id / email (or creates it) and issues the same JWT as email login,
  // so from here on the app can't tell the two apart.
  const loginWithGoogle = useCallback(async () => {
    const idToken = await signInWithGoogle();
    const { user: googleUser, token } = await googleLoginRequest(idToken);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(googleUser);
  }, []);

  // Local-only for now: there is no PATCH /auth/me endpoint yet, so edits live
  // in memory and reset on the next session restore.
  const updateProfile = useCallback((patch) => {
    setUser((current) => ({ ...(current ?? {}), ...patch }));
  }, []);

  const logout = useCallback(async () => {
    // Needs the auth token, so it runs before the session is cleared.
    await unregisterFromPush();
    await AsyncStorage.removeItem(TOKEN_KEY);
    await signOutOfGoogle();
    setUser(null);
  }, []);

  /**
   * Signing out when the server has already stopped accepting this account.
   *
   * Deliberately not `logout()`: that first calls unregisterFromPush, which is
   * an authenticated request. For a blocked account it is refused, which would
   * announce the block again and leave the person stuck on a screen that no
   * longer works. Nothing here talks to the server.
   */
  const forceSignOut = useCallback(async (reason) => {
    setSuspendedNotice(reason || 'Your account has been blocked by an administrator.');
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await signOutOfGoogle();
    } finally {
      // Last, because RootNavigator swaps to the sign-in stack the moment this
      // is null — and the storage above must already be clear by then, or a
      // restored session would put them straight back.
      setUser(null);
    }
  }, []);

  // Any request answering ACCOUNT_SUSPENDED ends the session, wherever in the
  // app the person happens to be.
  useEffect(() => {
    setAccountSuspendedHandler((message) => {
      forceSignOut(message);
    });
    return () => setAccountSuspendedHandler(null);
  }, [forceSignOut]);

  const clearSuspendedNotice = useCallback(() => setSuspendedNotice(null), []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      register,
      verifyEmail,
      loginWithGoogle,
      logout,
      updateProfile,
      suspendedNotice,
      clearSuspendedNotice,
    }),
    [
      user,
      isLoading,
      login,
      register,
      verifyEmail,
      loginWithGoogle,
      logout,
      updateProfile,
      suspendedNotice,
      clearSuspendedNotice,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
