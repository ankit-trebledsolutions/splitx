import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSocket } from '../context/SocketProvider';
import { getWallet } from '../api/wallet.api';

/**
 * The signed-in person's credits (GET /wallet) for the screen that shows them:
 * read on every visit, and kept current while it is open by the server's
 * 'wallet:updated' ({ balance, free, paid }), which follows every change.
 *
 * `wallet` stays null until the first answer. `error` is the last failure:
 * offline, or a server from before wallets (`error.status === 404`). Screens
 * that only mention credits in passing simply show nothing then.
 *
 * `onChange` runs after each live update (the Wallet screen reloads its
 * history with it).
 */
const useWallet = ({ onChange } = {}) => {
  const { socket, connected } = useSocket();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    try {
      const next = await getWallet();
      setWallet(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err);
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!socket || !connected) return undefined;
    const onUpdated = (totals) => {
      // Only the totals come live; prices and the renew date stay as read.
      setWallet((prev) => (prev ? { ...prev, ...totals } : prev));
      onChangeRef.current?.(totals);
    };
    socket.on('wallet:updated', onUpdated);
    return () => socket.off('wallet:updated', onUpdated);
  }, [socket, connected]);

  return { wallet, error, refresh };
};

export default useWallet;
