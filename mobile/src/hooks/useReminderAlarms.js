import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSocket } from '../context/SocketProvider';
import { ensureAlarmPermissions } from '../components/AlarmPermissionSheet';
import { pushRegistrationSettled } from '../utils/pushNotifications';
import { registerReminderPushTask } from '../utils/reminderPushTask';
import {
  addAlarmListener,
  showRingingAlarm,
  syncReminderAlarms,
  takeAlarmRoute,
} from '../utils/reminderAlarms';

// Set once the "Turn on reminder alarms" sheet has been shown on opening the
// app. After that it only comes up when a reminder is being saved.
const ASKED_KEY = 'splix.alarmPermissionAsked';

/**
 * Keeps this phone's reminder alarms in step while someone is signed in, and
 * follows an alarm into the app. `ready` must only be true once the signed-in
 * navigator is mounted (the same rule as usePushNotifications).
 */
const useReminderAlarms = ({ userId, ready }) => {
  const navigation = useNavigation();
  const { socket, connected } = useSocket();

  // Signed in: let silent reminder pushes reach the app, and set the alarms.
  useEffect(() => {
    if (!userId) return;
    registerReminderPushTask();
    syncReminderAlarms();
  }, [userId]);

  // Back in the app: reminders may have changed while it was away.
  useEffect(() => {
    if (!userId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncReminderAlarms();
    });
    return () => subscription.remove();
  }, [userId]);

  // The server says a reminder of mine, or in one of my groups, has changed.
  useEffect(() => {
    if (!socket || !connected) return undefined;
    const onChanged = () => syncReminderAlarms();
    socket.on('reminder:changed', onChanged);
    return () => socket.off('reminder:changed', onChanged);
  }, [socket, connected]);

  // Coming to the front: an alarm may be ringing (show its screen), or one may
  // have asked the app to go somewhere ("Open in Splix" on the alarm screen, or
  // a tap on a missed reminder).
  useEffect(() => {
    if (!ready) return undefined;
    const follow = () => {
      showRingingAlarm();
      const route = takeAlarmRoute();
      if (route) navigation.navigate(...route);
    };
    follow();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') follow();
    });
    const alarms = addAlarmListener((event) => {
      if (event.type === 'open') follow();
    });
    return () => {
      appState.remove();
      alarms.remove();
    };
  }, [ready, navigation]);

  // The first time the app is opened after signing in: explain reminder alarms
  // and ask for whatever Android has not allowed yet.
  useEffect(() => {
    if (!ready || !userId) return undefined;
    let cancelled = false;
    (async () => {
      if (await AsyncStorage.getItem(ASKED_KEY)) return;
      // Android's own notification popup comes first; two prompts at once would collide.
      await pushRegistrationSettled();
      if (cancelled) return;
      await AsyncStorage.setItem(ASKED_KEY, '1');
      await ensureAlarmPermissions();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);
};

export default useReminderAlarms;
