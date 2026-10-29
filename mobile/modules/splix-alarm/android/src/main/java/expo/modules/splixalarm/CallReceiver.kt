package expo.modules.splixalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The two things about a ringing call that arrive as a broadcast: the Decline
 * button on its notification, and the clock saying nobody answered (used when
 * the notification rings without the service; see CallCenter).
 */
class CallReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_DECLINE -> CallCenter.decline(context)
      ACTION_TIMEOUT -> CallCenter.timeout(context)
    }
  }

  companion object {
    const val ACTION_DECLINE = "expo.modules.splixalarm.CALL_DECLINE"
    const val ACTION_TIMEOUT = "expo.modules.splixalarm.CALL_TIMEOUT"

    fun intent(context: Context, action: String): Intent =
      Intent(context, CallReceiver::class.java).setAction(action)
  }
}
