import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { CallingState } from '@stream-io/video-react-native-sdk';
import { useStreamClient } from './StreamVideoProvider';
import { useSocket } from './SocketProvider';
import { useAuth } from './AuthContext';
import AppAlert from '../components/AppAlert';
import { postCallEvent, startCall } from '../api/stream.api';
import { ensureCallPermissions } from '../components/AlarmPermissionSheet';
import { isNoCredits, showCallEndedNoCredits, showNoCredits } from '../components/NoCreditsSheet';
import { callsSupported, setActiveCall } from '../utils/incomingCalls';

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

// Someone who makes calls will want to be rung for them too. Asked the first
// time they start or join one each time the app runs, and only while something
// a ringing call needs is still switched off. Not where calls cannot ring
// anyway (iOS, or a build from before they did).
let askedToRing = false;
const askToRingOnce = async () => {
  if (askedToRing || !callsSupported) return;
  askedToRing = true;
  await ensureCallPermissions();
};

// The server ends a call for lack of credits in two messages: Stream's own
// "call ended" and our socket's reason. Either may come first, so the reason
// is still taken this long after the call itself has gone.
const REASON_WAIT_MS = 60 * 1000;

// The low-credits warning stands until the block it is about is due, and this
// long after: the server's sweep (every minute) ends the call by then, or the
// block was paid after all.
const LOW_GRACE_MS = 60 * 1000;
const LOW_FALLBACK_MS = 2 * 60 * 1000;

/**
 * Holds the call the user is currently in, above the navigator, so it keeps
 * running when they leave the call screen to browse the chat (WhatsApp-style
 * "minimize"). Screens read it via useActiveCall(); leave() ends the call, and
 * so does the server, which can end it for everyone (credits ran out).
 */
const ActiveCallContext = createContext(null);

export const ActiveCallProvider = ({ children }) => {
  const { client } = useStreamClient();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const userId = user?._id;

  const [call, setCall] = useState(null);
  const [groupId, setGroupId] = useState(null);
  // For the call screen while nobody else has joined yet.
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | joining | joined | error
  const [error, setError] = useState(null);
  // What the call costs this person, who started it: { price, blockMinutes }.
  // Null when it costs them nothing (free, or they joined someone else's).
  const [billing, setBilling] = useState(null);
  // The server's warning that the next block cannot be paid: { endsAt }.
  const [creditsLow, setCreditsLow] = useState(null);

  // The call this phone is in, for the handlers below that outlive a render:
  // { call, groupId, leaving, endedByServer }. Whoever lets go of it first
  // clears it, so a call is only ever let go of once.
  const activeRef = useRef(null);
  // The last call the server ended: { groupId, at }. See REASON_WAIT_MS.
  const endedRef = useRef(null);

  // The phone is told which call the person is in: that one must not ring
  // here, and it stops ringing if they join it from inside the app.
  useEffect(() => {
    setActiveCall(status === 'joining' || status === 'joined' ? groupId : null);
  }, [status, groupId]);

  const clear = useCallback(() => {
    setCall(null);
    setGroupId(null);
    setGroupName('');
    setStatus('idle');
    setError(null);
    setBilling(null);
    setCreditsLow(null);
  }, []);

  // Lets go of a call this phone was in. `announce`: we were the last one in
  // it, so post "Call ended" once (which also stops the others' phones ringing).
  // Not for a call the server ended: it has said so itself.
  const release = useCallback(
    (active, { announce = false } = {}) => {
      if (!active || activeRef.current !== active) return;
      activeRef.current = null;
      clear();
      if (active.endedByServer) endedRef.current = { groupId: active.groupId, at: Date.now() };
      else if (announce) postCallEvent(active.groupId, 'ended').catch(() => {});
    },
    [clear]
  );

  /**
   * answering: the person accepted this call as it rang. It is then only ever
   * joined, never started: if everyone has left by the time the app is open,
   * joining would start a new call and ring the whole group again.
   */
  const join = useCallback(
    async (targetGroupId, { audioOnly = false, answering = false, groupName: name = '' } = {}) => {
      if (!client) return;
      // Already in this group's call — just surface it, don't rejoin.
      if (call && groupId === targetGroupId) return;

      setStatus('joining');
      setError(null);
      setGroupId(targetGroupId);
      setGroupName(name);
      setBilling(null);
      setCreditsLow(null);
      try {
        if (!answering) await askToRingOnce();

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
        if (answering && isFirst) throw new Error('This call has already ended.');

        // Starting the call, not joining one: while calls cost credits the
        // server charges the first block now, before anyone is rung. Only "not
        // enough credits" stops the call. Any other failure (a server from
        // before credits answers 404) lets it go ahead as it always has.
        let bill = null;
        if (isFirst && !answering) {
          try {
            bill = await startCall(targetGroupId);
          } catch (err) {
            if (isNoCredits(err)) {
              clear();
              showNoCredits(err);
              return;
            }
          }
        }

        // Said outright rather than left to the call type's defaults: a video
        // call starts with the camera on, so the caller sees themselves while
        // the others are still being rung.
        if (audioOnly) await nextCall.camera.disable();
        else await nextCall.camera.enable();
        await nextCall.join({ create: true });

        activeRef.current = { call: nextCall, groupId: targetGroupId };
        setCall(nextCall);
        setStatus('joined');
        if (bill?.billed) setBilling({ price: bill.price, blockMinutes: bill.blockMinutes });

        // Also what makes the other members' phones ring.
        if (isFirst) postCallEvent(targetGroupId, 'started', { video: !audioOnly }).catch(() => {});
      } catch (err) {
        setError(err);
        setStatus('error');
      }
    },
    [client, call, groupId, clear]
  );

  const leave = useCallback(async () => {
    const active = activeRef.current;
    if (!active) return;
    active.leaving = true;
    // If we're the last participant, the call is ending — post "Call ended" once.
    const wasLast = (active.call.state.participantCount ?? 1) <= 1;
    try {
      await active.call.leave();
    } catch {
      /* already disconnected */
    }
    release(active, { announce: wasLast });
  }, [release]);

  // The call can be over without leave(): the server ended it for everyone
  // (Stream's "call ended"), or the call screen's own hang-up button left it
  // before telling us. Stream's SDK leaves the call by itself then; this lets
  // go of it here too, so nobody is left on a dead call screen.
  useEffect(() => {
    const active = activeRef.current;
    if (!call || active?.call !== call) return undefined;

    // A call can carry the end time of an earlier session; only a new one counts.
    const endedAtJoin = call.state.endedAt?.getTime?.() ?? null;
    const endedSinceJoin = () => {
      const endedAt = call.state.endedAt?.getTime?.() ?? null;
      return endedAt !== null && endedAt !== endedAtJoin;
    };
    const markEnded = () => {
      active.endedByServer = true;
    };
    const offEnded = call.on('call.ended', markEnded);
    const offSfuEnded = call.on('callEnded', markEnded);

    const subscription = call.state.callingState$.subscribe((state) => {
      if (active.leaving) return; // leave() does the rest
      if (state === CallingState.RECONNECTING_FAILED && endedSinceJoin()) {
        // It ended while this phone was away: the SDK gives up reconnecting
        // but does not leave on its own.
        active.endedByServer = true;
        call.leave().catch(() => {});
        return;
      }
      if (state !== CallingState.LEFT) return;
      if (endedSinceJoin()) active.endedByServer = true;
      release(active, { announce: (call.state.participantCount ?? 1) <= 1 });
    });

    return () => {
      offEnded();
      offSfuEnded();
      subscription.unsubscribe();
    };
  }, [call, release]);

  // Credits for a call, from the server to the person paying for it.
  useEffect(() => {
    if (!socket || !connected) return undefined;

    const isActive = (id) => activeRef.current && String(activeRef.current.groupId) === String(id);

    const onLow = ({ groupId: id, endsAt } = {}) => {
      if (isActive(id)) setCreditsLow({ endsAt });
    };

    // The server ended the call for everyone because the person paying for it
    // ran out of credits. Sent to the whole group; `payerId` says who that was.
    const onEnded = ({ groupId: id, payerId } = {}) => {
      if (isActive(id)) {
        const active = activeRef.current;
        active.endedByServer = true;
        active.call.leave().catch(() => {});
        release(active);
      } else {
        const ended = endedRef.current;
        if (!ended || String(ended.groupId) !== String(id)) return;
        if (Date.now() - ended.at > REASON_WAIT_MS) return;
      }
      endedRef.current = null;
      // Only the payer is offered a way to get credits; the others just learn why.
      if (!payerId || String(payerId) === String(userId)) showCallEndedNoCredits();
      else {
        AppAlert.alert(
          'Call ended',
          'The person who started this call ran out of credits, so it ended for everyone.'
        );
      }
    };

    socket.on('wallet:call-low', onLow);
    socket.on('wallet:call-ended', onEnded);
    return () => {
      socket.off('wallet:call-low', onLow);
      socket.off('wallet:call-ended', onEnded);
    };
  }, [socket, connected, release, userId]);

  useEffect(() => {
    if (!creditsLow) return undefined;
    const due = new Date(creditsLow.endsAt).getTime();
    const wait = Number.isFinite(due) ? due + LOW_GRACE_MS - Date.now() : LOW_FALLBACK_MS;
    const timer = setTimeout(() => setCreditsLow(null), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [creditsLow]);

  const dismissCreditsLow = useCallback(() => setCreditsLow(null), []);

  const value = useMemo(
    () => ({
      call,
      groupId,
      groupName,
      status,
      error,
      billing,
      creditsLow,
      join,
      leave,
      dismissCreditsLow,
    }),
    [call, groupId, groupName, status, error, billing, creditsLow, join, leave, dismissCreditsLow]
  );

  return <ActiveCallContext.Provider value={value}>{children}</ActiveCallContext.Provider>;
};

export const useActiveCall = () => {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error('useActiveCall must be used within ActiveCallProvider');
  return ctx;
};
