package expo.modules.splixalarm

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * Where every push reaches the app. It takes the ones about a group call and
 * rings (or stops ringing) for them right here, with no JavaScript involved,
 * so the phone rings within a moment of the push even when the app is closed.
 *
 * Everything else is handed on untouched to expo-notifications, whose service
 * this one extends and stands in front of (a higher priority in the manifest):
 * it shows the notification, runs the app's background task, and looks after
 * the push token exactly as before.
 */
class SplixMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val signal = try {
      CallSignal.fromPush(remoteMessage.data)
    } catch (_: Exception) {
      // Whatever it is, it is not a call this version can read.
      null
    }
    when (signal) {
      is CallSignal.Ring -> CallCenter.ring(applicationContext, signal.call)
      is CallSignal.End -> CallCenter.end(applicationContext, signal.groupId, signal.at)
      null -> super.onMessageReceived(remoteMessage)
    }
  }
}
