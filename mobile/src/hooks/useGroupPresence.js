import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketProvider';

const EMPTY = new Set();

/**
 * The set of user ids currently online in a group, kept live.
 * Snapshot on open (presence:query), then presence:update events as people
 * come and go. Re-runs on every reconnect so a dropped connection can't leave
 * stale dots behind.
 */
export const useGroupPresence = (groupId) => {
  const { socket, connected } = useSocket();
  const [online, setOnline] = useState(EMPTY);

  useEffect(() => {
    if (!socket || !connected || !groupId) return undefined;

    let active = true;
    // Ensure we're in the room (covers groups joined after connecting),
    // then ask who's online right now.
    socket.emit('group:open', { groupId });
    socket.emit('presence:query', { groupId }, ({ online: ids } = {}) => {
      if (active) setOnline(new Set(ids ?? []));
    });

    const onUpdate = ({ userId, online: isOnline }) => {
      setOnline((prev) => {
        if (prev.has(userId) === isOnline) return prev; // no change, no re-render
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };
    socket.on('presence:update', onUpdate);

    return () => {
      active = false;
      socket.off('presence:update', onUpdate);
    };
  }, [socket, connected, groupId]);

  return online;
};
