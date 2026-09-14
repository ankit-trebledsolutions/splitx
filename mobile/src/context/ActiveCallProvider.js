import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { useStreamClient } from './StreamVideoProvider';
import { postCallEvent } from '../api/stream.api';

// Android needs runtime consent for the camera/mic before a call can open them;
// iOS prompts on first use via the Info.plist strings. A voice call only needs
// the mic. Returns false if the user denies anything required.
const requestCallPermissions = async (audioOnly) => {
  if (Platform.OS !== 'android') return true;
  const needed = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (!audioOnly) needed.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const result = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
};

/**
 * Holds the call the user is currently in, above the navigator, so it keeps
 * running when they leave the call screen to browse the chat (WhatsApp-style
 * "minimize"). Screens read it via useActiveCall(); only leave() ends the call.
 */
const ActiveCallContext = createContext(null);

export const ActiveCallProvider = ({ children }) => {
  const { client } = useStreamClient();

  const [call, setCall] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | joining | joined | error
  const [error, setError] = useState(null);

  const join = useCallback(
    async (targetGroupId, { audioOnly = false } = {}) => {
      if (!client) return;
      // Already in this group's call — just surface it, don't rejoin.
      if (call && groupId === targetGroupId) return;

      setStatus('joining');
      setError(null);
      setGroupId(targetGroupId);
      try {
        const granted = await requestCallPermissions(audioOnly);
        if (!granted) {
          throw new Error('Camera and microphone access are needed to join the call.');
        }

        const nextCall = client.call('default', targetGroupId);

        // If nobody is in the call yet, we're the one starting it — used to post
        // the "call started" chat message only once.
        let isFirst = false;
        try {
          const info = await nextCall.get();
          isFirst = !(info.call?.session?.participants?.length);
        } catch {
          isFirst = true; // call doesn't exist yet
        }

        if (audioOnly) await nextCall.camera.disable();
        await nextCall.join({ create: true });

        setCall(nextCall);
        setStatus('joined');

        if (isFirst) postCallEvent(targetGroupId, 'started').catch(() => {});
      } catch (err) {
        setError(err);
        setStatus('error');
      }
    },
    [client, call, groupId]
  );

  const leave = useCallback(async () => {
    if (!call) return;
    const gid = groupId;
    // If we're the last participant, the call is ending — post "Call ended" once.
    const wasLast = (call.state.participantCount ?? 1) <= 1;
    try {
      await call.leave();
    } catch {
      /* already disconnected */
    }
    setCall(null);
    setGroupId(null);
    setStatus('idle');
    setError(null);
    if (wasLast && gid) postCallEvent(gid, 'ended').catch(() => {});
  }, [call, groupId]);

  const value = useMemo(
    () => ({ call, groupId, status, error, join, leave }),
    [call, groupId, status, error, join, leave]
  );

  return <ActiveCallContext.Provider value={value}>{children}</ActiveCallContext.Provider>;
};

export const useActiveCall = () => {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error('useActiveCall must be used within ActiveCallProvider');
  return ctx;
};
