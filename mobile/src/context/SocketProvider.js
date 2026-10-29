import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { API_ORIGIN, TOKEN_KEY } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * One live connection to our backend for the whole app: opened after login,
 * closed on logout. Screens read it with useSocket() to receive pushed events
 * (new messages, typing, presence) instead of polling.
 *
 * The socket is deliberately dropped while the app is in the background and
 * reopened when it returns: "online" then means "actually looking at the app",
 * and no battery or data is spent while it isn't.
 */
const SocketContext = createContext({ socket: null, connected: false });

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?._id;

  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;

    const s = io(API_ORIGIN, {
      // Read the token on every (re)connection attempt so a fresh login is
      // picked up without recreating the socket.
      auth: (cb) => {
        AsyncStorage.getItem(TOKEN_KEY)
          .then((token) => cb({ token }))
          .catch(() => cb({}));
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => console.warn('[socket]', err.message));

    const onAppState = (state) => {
      if (state === 'active') {
        if (!s.connected) s.connect();
      } else if (state === 'background') {
        s.disconnect();
      }
    };
    const subscription = AppState.addEventListener('change', onAppState);

    setSocket(s);

    return () => {
      subscription.remove();
      setSocket(null);
      setConnected(false);
      s.removeAllListeners();
      s.disconnect(); // logout -> the server marks us offline
    };
  }, [userId]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
