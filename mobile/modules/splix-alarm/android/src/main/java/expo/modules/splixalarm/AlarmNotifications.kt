package expo.modules.splixalarm

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Date

/**
 * Every notification the alarm produces:
 *
 *  ringing  while it rings: the full-screen alarm when the phone is locked, a
 *           banner with Snooze and Dismiss when it is in use
 *  plain    in place of ringing, when Android does not let the app ring
 *  snoozed  "rings again at ...", until it does
 *  missed   nobody answered, or the phone was off at the time
 */
@SuppressLint("MissingPermission") // Posting without the permission is simply dropped by Android.
object AlarmNotifications {
  // The alarm, as JSON, on an intent that opens the app from a notification.
  const val EXTRA_OPEN = "splixAlarmOpen"

  const val RINGING_ID = 7301
  private const val MISSED_ID = 7302
  private const val SNOOZED_ID = 7303
  private const val PLAIN_ID = 7304

  // Bump the suffix to change a channel's sound or importance: Android keeps a
  // channel's settings for good once it exists.
  private const val CHANNEL_RINGING = "splix_alarm_ringing_v1"
  private const val CHANNEL_PLAIN = "splix_alarm_plain_v1"
  private const val CHANNEL_INFO = "splix_alarm_info_v1"

  private const val ACCENT = 0xFF00C4D0.toInt()
  private const val IMMUTABLE = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  fun timeText(context: Context, millis: Long): String =
    DateFormat.getTimeFormat(context).format(Date(millis))

  // The second line: the note if there is one. The group is already in the
  // header (setSubText), so it is not repeated here.
  private fun detail(alarm: Alarm): String = alarm.body.ifEmpty { "Reminder" }

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // Silent on purpose: AlarmService plays the sound itself, on the alarm
    // volume, so it is heard with the phone on silent.
    val ringing = NotificationChannel(CHANNEL_RINGING, "Reminder alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Reminders that ring like an alarm"
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val plain = NotificationChannel(CHANNEL_PLAIN, "Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Reminders shown as a notification when alarms are not allowed"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val info = NotificationChannel(CHANNEL_INFO, "Missed and snoozed reminders", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Reminders you snoozed or did not answer"
    }
    manager.createNotificationChannels(listOf(ringing, plain, info))
  }

  // Opens the app at whatever the reminder is about (JavaScript reads the extra).
  private fun openApp(context: Context, alarm: Alarm): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launch.putExtra(EXTRA_OPEN, alarm.toJson().toString())
    // One pending intent per reminder, or each would overwrite the last one's extra.
    return PendingIntent.getActivity(context, alarm.id.hashCode(), launch, IMMUTABLE)
  }

  /**
   * fullScreen: the phone is locked or showing another app, so Android decides
   * between the alarm screen and a banner. False when the app itself is on
   * screen: the alarm screen is opened directly and a banner would only repeat it.
   */
  fun ringing(context: Context, alarm: Alarm, fullScreen: Boolean): Notification {
    ensureChannels(context)
    val alarmScreen = PendingIntent.getActivity(context, 1, AlarmActivity.intent(context), IMMUTABLE)
    val snooze = PendingIntent.getService(
      context, 2, AlarmService.actionIntent(context, AlarmService.ACTION_SNOOZE), IMMUTABLE
    )
    val dismiss = PendingIntent.getService(
      context, 3, AlarmService.actionIntent(context, AlarmService.ACTION_DISMISS), IMMUTABLE
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_RINGING)
      .setSmallIcon(R.drawable.splix_ic_alarm)
      .setColor(ACCENT)
      .setContentTitle(alarm.title)
      .setContentText(detail(alarm))
      .setSubText(alarm.groupName)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setWhen(alarm.fireAt)
      .setShowWhen(true)
      .setOngoing(true)
      .setAutoCancel(false)
      .setSound(null)
      .setContentIntent(alarmScreen)
      // Android 14+ lets a foreground service's notification be swiped away.
      // Without this the alarm would go on ringing with nothing left to stop it.
      .setDeleteIntent(dismiss)
      .addAction(0, "Snooze", snooze)
      .addAction(0, "Dismiss", dismiss)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

    if (fullScreen) builder.setFullScreenIntent(alarmScreen, true) else builder.setSilent(true)
    return builder.build()
  }

  fun showPlain(context: Context, alarm: Alarm) {
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_PLAIN)
      .setSmallIcon(R.drawable.splix_ic_alarm)
      .setColor(ACCENT)
      .setContentTitle(alarm.title)
      .setContentText(detail(alarm))
      .setSubText(alarm.groupName)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setWhen(alarm.fireAt)
      .setShowWhen(true)
      .setAutoCancel(true)
      .setContentIntent(openApp(context, alarm))
      .build()
    NotificationManagerCompat.from(context).notify(alarm.id, PLAIN_ID, notification)
  }

  fun showMissed(context: Context, alarm: Alarm) {
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_INFO)
      .setSmallIcon(R.drawable.splix_ic_alarm)
      .setColor(ACCENT)
      .setContentTitle("Missed reminder")
      .setContentText(alarm.title)
      .setSubText(alarm.groupName)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setWhen(alarm.fireAt)
      .setShowWhen(true)
      .setAutoCancel(true)
      .setContentIntent(openApp(context, alarm))
      .build()
    NotificationManagerCompat.from(context).notify(alarm.id, MISSED_ID, notification)
  }

  // [snooze] is the ring-again: its fireAt is when the reminder comes back.
  fun showSnoozed(context: Context, snooze: Alarm) {
    ensureChannels(context)
    val cancel = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, AlarmReceiver::class.java)
        .setAction(AlarmReceiver.ACTION_CANCEL_SNOOZE)
        .setData(Uri.parse("splixalarm://${AlarmScheduler.KIND_SNOOZE}/${snooze.id}")),
      IMMUTABLE
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_INFO)
      .setSmallIcon(R.drawable.splix_ic_alarm)
      .setColor(ACCENT)
      .setContentTitle(snooze.title)
      .setContentText("Snoozed. Rings again at ${timeText(context, snooze.fireAt)}")
      .setSubText(snooze.groupName)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setShowWhen(false)
      .setOngoing(true)
      .setContentIntent(openApp(context, snooze))
      .addAction(0, "Dismiss", cancel)
      .build()
    NotificationManagerCompat.from(context).notify(snooze.id, SNOOZED_ID, notification)
  }

  fun cancelSnoozed(context: Context, id: String) {
    NotificationManagerCompat.from(context).cancel(id, SNOOZED_ID)
  }

  // Everything still on screen about one reminder (it was deleted or switched off).
  fun cancelFor(context: Context, id: String) {
    val manager = NotificationManagerCompat.from(context)
    manager.cancel(id, SNOOZED_ID)
    manager.cancel(id, MISSED_ID)
    manager.cancel(id, PLAIN_ID)
  }

  /**
   * Every missed, snoozed and plain reminder notification still showing,
   * whichever reminder it was for. Used on sign-out, when the list that would
   * say which reminders they belonged to has already been emptied.
   */
  fun cancelEverything(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val ours = setOf(MISSED_ID, SNOOZED_ID, PLAIN_ID)
    try {
      for (shown in manager.activeNotifications) {
        if (shown.id in ours) manager.cancel(shown.tag, shown.id)
      }
    } catch (_: Exception) {
      // Nothing to clear, or the list could not be read: not worth failing a sign-out over.
    }
  }
}
