import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TOKEN_KEY,
  ACCOUNT_SUSPENDED,
  setAccountSuspendedHandler,
  onNextServerAnswer,
} from '../api/client';
import {
  loginRequest,
  registerRequest,
  verifyEmailRequest,
  meRequest,
  googleLoginRequest,
} from '../api/auth.api';
import { signInWithGoogle, signOutOfGoogle } from '../utils/googleSignIn';
import { unregisterFromPush } from '../utils/pushNotifications';
import { clearReminderAlarms } from '../utils/reminderAlarms';

const AuthContext = createContext(null);

// The signed-in user as the server last described them. Kept beside the token
// so the app can still be opened when the server cannot be reached.
const USER_KEY = 'splix.user';

// Bumped whenever the saved session is replaced or removed. A check of the
// session that was already under way at that moment is about one that no
// longer exists, and must not put it back.
let epoch = 0;

// Token and user go in together, so the saved user can never belong to a
// different account than the saved token.
const saveSession = (token, user) => {
  epoch += 1;
  return AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
};

const clearSession = () => {
  epoch += 1;
  // Nobody is left whose session would still need checking.
  onNextServerAnswer(null);
  return AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
};

const savedUser = async () => {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(USER_KEY));
    return saved?._id ? saved : null;
  } catch {
    return null;
  }
};

// The server turning the session itself down: the token is no longer good, or
// an administrator has blocked the account. No other failure says anything
// about the session, least of all a timeout or having no connection.
const sessionRejected = (err) => err.status === 401 || err.code === ACCOUNT_SUSPENDED;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Why the session ended, when it was not the person's own doing. Survives the
  // trip back to the sign-in screen so they are told what happened instead of
  // finding themselves logged out for no visible reason.
  const [suspendedNotice, setSuspendedNotice] = useState(null);

  /**
   * Asks the server whether the saved session still stands, and acts on the
   * answer: the user it sends back replaces the saved one, a rejection ends
   * the session. Resolves to false when there was no answer to act on.
   */
  const checkSession = useCallback(async () => {
    const startedIn = epoch;
    try {
      const { user: me } = await meRequest();
      // Signed out, or signed in afresh, while the request was on its way: the
      // answer is about a session that is gone.
      if (startedIn !== epoch) return true;
      setUser(me);
      // Best-effort. All a failed write costs is the way in on an offline start.
      AsyncStorage.setItem(USER_KEY, JSON.stringify(me)).catch(() => {});
      return true;
    } catch (err) {
      // Includes a block by an administrator: forceSignOut is already ending
      // the session by the time the request is seen to fail.
      if (startedIn !== epoch) return true;
      if (!sessionRejected(err)) return false;
      try {
        await clearSession();
      } finally {
        setUser(null);
      }
      return true;
    }
  }, []);

  useEffect(() => {
    // The check that could not be made is made at the server's next answer,
    // and again at the one after if that attempt gets none either.
    const checkOnNextAnswer = () =>
      onNextServerAnswer(async () => {
        if (!(await checkSession())) checkOnNextAnswer();
      });

    const restoreSession = async () => {
      try {
        if (!(await AsyncStorage.getItem(TOKEN_KEY))) return;
        if (await checkSession()) return;
        // No answer is no reason to end the session: someone opening the app
        // in airplane mode would be signed out, with no way back in until they
        // are online again. They are let in as the person the server last said
        // they were. With nothing saved (a session from before the user was
        // kept) there is nobody to show, so it is the sign-in screen, but the
        // token stays for the next start.
        const saved = await savedUser();
        if (!saved) return;
        setUser(saved);
        checkOnNextAnswer();
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
    return () => onNextServerAnswer(null);
  }, [checkSession]);

  const login = useCallback(async (email, password) => {
    const { user: loggedIn, token } = await loginRequest({ email, password });
    await saveSession(token, loggedIn);
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
    await saveSession(token, verified);
    setUser(verified);
  }, []);

  // Google covers both sign-up and log-in: the backend finds the account by
  // Google id / email (or creates it) and issues the same JWT as email login,
  // so from here on the app can't tell the two apart.
  const loginWithGoogle = useCallback(async () => {
    const idToken = await signInWithGoogle();
    const { user: googleUser, token } = await googleLoginRequest(idToken);
    await saveSession(token, googleUser);
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
    await clearSession();
    // Their reminders must not ring for whoever signs in on this phone next.
    // After the token is gone, so a reminder push that lands in between finds
    // nobody signed in and sets nothing.
    await clearReminderAlarms();
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
      await clearSession();
      // Local only, like the rest of this: the alarms are on the phone.
      await clearReminderAlarms();
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
