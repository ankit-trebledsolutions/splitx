package expo.modules.splixalarm

import java.util.concurrent.CopyOnWriteArraySet

/**
 * How the ringing service tells the rest of the process what happened: the
 * alarm screen closes itself, and JavaScript (when the app is running) hears
 * about it. Everything lives in one process, so no broadcast is needed.
 */
object AlarmEvents {
  const val FIRED = "fired"
  const val STOPPED = "stopped"
  const val OPEN = "open"

  // Why a ringing alarm stopped.
  const val REASON_DISMISSED = "dismissed"
  const val REASON_SNOOZED = "snoozed"
  const val REASON_TIMEOUT = "timeout"
  const val REASON_OPENED = "opened"
  const val REASON_REPLACED = "replaced"

  fun interface Listener {
    fun onAlarmEvent(type: String, alarm: Alarm, reason: String?)
  }

  private val listeners = CopyOnWriteArraySet<Listener>()

  fun add(listener: Listener) {
    listeners.add(listener)
  }

  fun remove(listener: Listener) {
    listeners.remove(listener)
  }

  fun emit(type: String, alarm: Alarm, reason: String? = null) {
    for (listener in listeners) {
      try {
        listener.onAlarmEvent(type, alarm, reason)
      } catch (_: Exception) {
        // One listener failing must not stop the alarm from being handled.
      }
    }
  }
}
