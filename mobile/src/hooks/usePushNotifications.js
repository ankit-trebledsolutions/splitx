import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { registerForPush, routeForPush } from '../utils/pushNotifications';

/**
 * Registers this device for pushes once a user is signed in, and opens the
 * right screen when a push is tapped — including the tap that cold-starts the
 * app. `ready` must only be true once the signed-in navigator is mounted.
 */
const usePushNotifications = ({ userId, ready }) => {
  const navigation = useNavigation();
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef(null);

  useEffect(() => {
    if (userId) registerForPush();
  }, [userId]);

  useEffect(() => {
    if (!ready || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const { identifier, content } = response.notification.request;
    if (handledId.current === identifier) return;
    handledId.current = identifier;

    navigation.navigate(...routeForPush(content.data));
  }, [ready, response, navigation]);
};

export default usePushNotifications;
