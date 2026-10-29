package expo.modules.splixalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import androidx.core.content.ContextCompat

/**
 * Woken by Android at an alarm's time, whether or not the app is running.
 * Sets a repeating reminder for its next turn, then starts the ringing.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // splixalarm://<kind>/<id>, as built by AlarmScheduler.
    val kind = intent.data?.host ?: return
    val id = intent.data?.lastPathSegment ?: return

    when (intent.action) {
      AlarmScheduler.ACTION_FIRE -> fire(context.applicationContext, kind, id)
      ACTION_CANCEL_SNOOZE -> cancelSnooze(context.applicationContext, id)
    }
  }

  private fun fire(context: Context, kind: String, id: String) {
    val now = System.currentTimeMillis()
    val alarm = synchronized(AlarmStore.lock) { take(context, kind, id, now) } ?: return

    // Delivered far too late to be worth ringing for (Android may hold back an
    // alarm it was not allowed to make exact).
    if (now - alarm.fireAt > Alarm.LATE_LIMIT_MS) {
      AlarmNotifications.showMissed(context, alarm)
      return
    }

    holdWhileServiceStarts(context)
    try {
      ContextCompat.startForegroundService(context, AlarmService.ringIntent(context, alarm))
    } catch (_: Exception) {
      // Without the exact-alarm permission Android does not let a closed app
      // start ringing. The reminder still arrives, as a notification.
      AlarmNotifications.showPlain(context, alarm)
    }
  }

  /**
   * The alarm that has come due, taken off the list. A one-off is removed; a
   * repeating one is moved to its next turn and set again first, so a weekly
   * reminder carries on whatever happens to this ring. Null when the reminder
   * was deleted or switched off after Android had already been asked to ring.
   */
  private fun take(context: Context, kind: String, id: String, now: Long): Alarm? {
    val store = AlarmStore(context)
    if (kind == AlarmScheduler.KIND_SNOOZE) {
      val snooze = store.snooze(id) ?: return null
      store.removeSnooze(id)
      AlarmNotifications.cancelSnoozed(context, id)
      return snooze
    }

    val alarm = store.alarm(id) ?: return null
    // Counted from the alarm's own time when the clock says it is early, or
    // it would be set for right now and ring again at once.
    val next = alarm.nextAfter(maxOf(now, alarm.fireAt))
    if (next == null) {
      store.removeAlarm(id)
    } else {
      val upcoming = alarm.copy(fireAt = next)
      store.putAlarm(upcoming)
      AlarmScheduler.schedule(context, upcoming)
    }
    return alarm
  }

  private fun cancelSnooze(context: Context, id: String) = synchronized(AlarmStore.lock) {
    AlarmStore(context).removeSnooze(id)
    AlarmScheduler.cancel(context, id, AlarmScheduler.KIND_SNOOZE)
    AlarmNotifications.cancelSnoozed(context, id)
  }

  // Android only keeps the phone awake until this method returns; the service
  // takes its own lock once it is up. This covers the gap between the two.
  private fun holdWhileServiceStarts(context: Context) {
    try {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "splix:alarm-starting").acquire(HANDOVER_MS)
    } catch (_: Exception) {
      // Ring without it rather than not at all.
    }
  }

  companion object {
    const val ACTION_CANCEL_SNOOZE = "expo.modules.splixalarm.CANCEL_SNOOZE"

    private const val HANDOVER_MS = 10_000L
  }
}
