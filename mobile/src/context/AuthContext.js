import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY } from '../api/client';
import { loginRequest, registerRequest, meRequest } from '../api/auth.api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const register = useCallback(async (name, email, password) => {
    const { user: created, token } = await registerRequest({ name, email, password });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(created);
  }, []);

  // Local-only for now: there is no PATCH /auth/me endpoint yet, so edits live
  // in memory and reset on the next session restore.
  const updateProfile = useCallback((patch) => {
    setUser((current) => ({ ...(current ?? {}), ...patch }));
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, updateProfile }),
    [user, isLoading, login, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
