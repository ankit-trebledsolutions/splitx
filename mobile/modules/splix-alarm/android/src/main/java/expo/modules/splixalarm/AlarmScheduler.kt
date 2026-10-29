package expo.modules.splixalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Hands alarms to Android's own alarm clock, the one the Clock app uses, so
 * they ring at the exact minute with the app closed, the phone locked, or no
 * signal.
 */
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.splixalarm.FIRE"

  // A reminder's own time, and the ring-again after a snooze. Kept apart so a
  // weekly reminder can be waiting for next week and for its snooze at once.
  const val KIND_ALARM = "alarm"
  const val KIND_SNOOZE = "snooze"

  // A reminder whose time passed while the phone was off is shown as missed,
  // unless it is so old that even that would only confuse.
  private const val MISSED_WINDOW_MS = 12 * 60 * 60 * 1000L

  private fun manager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  /**
   * Whether Android lets this app ring on the minute. Always true before
   * Android 12; from Android 14 it is off until the user allows
   * "Alarms & reminders" for the app.
   */
  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager(context).canScheduleExactAlarms()

  // The same alarm always yields an equal intent, which is how Android knows
  // to replace or cancel the one already set.
  private fun operation(context: Context, id: String, kind: String): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      .setData(Uri.parse("splixalarm://$kind/$id"))
    return PendingIntent.getBroadcast(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // Opened from the "next alarm" line Android shows on the lock screen.
  private fun showIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun schedule(context: Context, alarm: Alarm, kind: String = KIND_ALARM) {
    val manager = manager(context)
    val operation = operation(context, alarm.id, kind)
    if (canScheduleExact(context)) {
      try {
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.fireAt, showIntent(context)), operation)
        return
      } catch (_: SecurityException) {
        // The permission was withdrawn between the check and the call.
      }
    }
    // Not allowed to be exact: Android picks a moment near the time, and when
    // it comes the reminder is a plain notification (see AlarmReceiver).
    manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.fireAt, operation)
  }

  fun cancel(context: Context, id: String, kind: String = KIND_ALARM) {
    manager(context).cancel(operation(context, id, kind))
  }

  /**
   * Sets every stored alarm again: after a restart or an app update, and when
   * the exact-alarm permission changes. Whatever came due in the meantime is
   * shown as missed, and a repeating one moves on to its next time.
   */
  fun restoreAll(context: Context) = synchronized(AlarmStore.lock) {
    val store = AlarmStore(context)
    val now = System.currentTimeMillis()

    for (alarm in store.alarms()) {
      if (alarm.fireAt <= now) reportMissed(context, alarm, now)
      val next = alarm.nextAfter(now)
      if (next == null) {
        store.removeAlarm(alarm.id)
      } else {
        val upcoming = alarm.copy(fireAt = next)
        store.putAlarm(upcoming)
        schedule(context, upcoming)
      }
    }

    for (snooze in store.snoozes()) {
      if (snooze.fireAt > now) {
        schedule(context, snooze, KIND_SNOOZE)
      } else {
        store.removeSnooze(snooze.id)
        AlarmNotifications.cancelSnoozed(context, snooze.id)
        reportMissed(context, snooze, now)
      }
    }
  }

  // "Missed reminder" for one that never rang, unless it is too old to matter.
  fun reportMissed(context: Context, alarm: Alarm, now: Long) {
    if (now - alarm.fireAt <= MISSED_WINDOW_MS) AlarmNotifications.showMissed(context, alarm)
  }
}
