import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppAlert from '../components/AppAlert';
import { useSocket } from '../context/SocketProvider';
import { useStreamClient } from '../context/StreamVideoProvider';
import { useActiveCall } from '../context/ActiveCallProvider';
import {
  acceptedCall,
  addCallListener,
  allowIncomingCalls,
  callsSupported,
  endIncomingCall,
  forgetAcceptedCall,
  showIncomingCall,
  showRingingCall,
  takeCallRoute,
} from '../utils/incomingCalls';

// How long an accepted call waits for the app to be able to join it (it may
// have only just been opened) before the person is told it did not work.
const JOIN_WAIT_MS = 30 * 1000;

const couldNotJoin = () =>
  AppAlert.alert('Could not join the call', 'Open the group to try again.');

/**
 * The app's side of a ringing group call (see utils/incomingCalls.js): lets
 * calls ring for whoever is signed in, passes on rings that come over the
 * socket, and joins the call once the person has pressed Accept. `ready` must
 * only be true once the signed-in navigator is mounted (the same rule as
 * usePushNotifications).
 */
const useIncomingCalls = ({ userId, ready }) => {
  const navigation = useNavigation();
  const { socket, connected } = useSocket();
  const { client, error: streamError } = useStreamClient();
  const { join } = useActiveCall();

  // The call the person accepted, until the app has joined it: { call, since }.
  const [answered, setAnswered] = useState(null);

  useEffect(() => {
    if (userId) allowIncomingCalls();
    // An answer must not outlive the person who gave it.
    else forgetAcceptedCall();
  }, [userId]);

  // While the app is open the socket brings a ring sooner than the push does.
  useEffect(() => {
    if (!callsSupported || !socket || !connected) return undefined;
    socket.on('call:ring', showIncomingCall);
    socket.on('call:end', endIncomingCall);
    return () => {
      socket.off('call:ring', showIncomingCall);
      socket.off('call:end', endIncomingCall);
    };
  }, [socket, connected]);

  // Coming to the front: a call may be ringing (show its screen), may just
  // have been accepted (join it), or a missed one may have been tapped (open
  // its group).
  useEffect(() => {
    if (!callsSupported || !ready) return undefined;
    const follow = () => {
      showRingingCall();
      const accepted = acceptedCall();
      if (accepted) {
        setAnswered(accepted);
        return;
      }
      const route = takeCallRoute();
      if (route) navigation.navigate(...route);
    };
    follow();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') follow();
    });
    const calls = addCallListener((event) => {
      if (event.type === 'open') follow();
    });
    return () => {
      appState.remove();
      calls.remove();
    };
  }, [ready, navigation]);

  // Joining needs the connection to the call service, which an app that was
  // opened by the Accept button is still making.
  useEffect(() => {
    if (!answered || !ready) return;
    if (client) {
      const { call } = answered;
      forgetAcceptedCall();
      setAnswered(null);
      // The group's chat first, so that leaving the call lands there.
      navigation.navigate('GroupChat', { groupId: call.groupId });
      join(call.groupId, { audioOnly: call.video !== true, answering: true });
      navigation.navigate('Call');
    } else if (streamError) {
      forgetAcceptedCall();
      setAnswered(null);
      couldNotJoin();
    }
  }, [answered, ready, client, streamError, join, navigation]);

  // ...and if it never gets made, the person is told rather than left waiting.
  useEffect(() => {
    if (!answered) return undefined;
    const left = Math.max(0, JOIN_WAIT_MS - (Date.now() - answered.since));
    const timer = setTimeout(() => {
      forgetAcceptedCall();
      setAnswered(null);
      couldNotJoin();
    }, left);
    return () => clearTimeout(timer);
  }, [answered]);
};

export default useIncomingCalls;
