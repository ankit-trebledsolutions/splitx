import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StreamVideo, StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { useAuth } from './AuthContext';
import { streamTokenRequest } from '../api/stream.api';

// Connects the logged-in user to Stream (video calling) and exposes the
// client app-wide. If the connection fails the rest of the app keeps
// working — only the call screens are affected.
const StreamClientContext = createContext({ client: null, error: null });

export const StreamVideoProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?._id;

  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    let connected;

    (async () => {
      try {
        const { apiKey, token, user: streamUser } = await streamTokenRequest();
        if (cancelled) return;
        connected = StreamVideoClient.getOrCreateInstance({
          apiKey,
          user: { id: streamUser.id, name: streamUser.name },
          token,
          // Called by the SDK whenever the token expires.
          tokenProvider: async () => (await streamTokenRequest()).token,
        });
        setClient(connected);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();

    return () => {
      cancelled = true;
      setClient(null);
      setError(null);
      connected?.disconnectUser().catch(() => {});
    };
  }, [userId]);

  const value = useMemo(() => ({ client, error }), [client, error]);

  return (
    <StreamClientContext.Provider value={value}>
      {client ? <StreamVideo client={client}>{children}</StreamVideo> : children}
    </StreamClientContext.Provider>
  );
};

export const useStreamClient = () => useContext(StreamClientContext);
