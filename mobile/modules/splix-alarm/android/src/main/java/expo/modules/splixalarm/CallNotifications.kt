package expo.modules.splixalarm

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

/**
 * Every notification a group call produces:
 *
 *  ringing  while it rings: the call screen when the phone is locked, a banner
 *           with Decline and Answer when it is in use
 *  missed   nobody answered here, or the call ended first
 *  waiting  a call that started while the person was busy with another one
 */
@SuppressLint("MissingPermission") // Posting without the permission is simply dropped by Android.
object CallNotifications {
  // The call, as JSON, on the intent that opens the app from a missed call.
  const val EXTRA_OPEN = "splixCallOpen"

  const val RINGING_ID = 7311
  private const val MISSED_ID = 7312

  // Bump the suffix to change a channel's sound or importance: Android keeps a
  // channel's settings for good once it exists.
  private const val CHANNEL_RINGING = "splix_call_ringing_v1"
  private const val CHANNEL_RINGTONE = "splix_call_ringtone_v1"
  private const val CHANNEL_MISSED = "splix_call_missed_v1"

  private const val ACCENT = 0xFF00C4D0.toInt()
  private const val IMMUTABLE = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  private val VIBRATION = longArrayOf(0, 1000, 1000)

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // Silent on purpose: CallService plays the ringtone itself, so the call is
    // heard whatever the phone maker did to this channel's settings.
    val ringing = NotificationChannel(CHANNEL_RINGING, "Incoming group calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Group calls ringing on this phone"
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    // For when Android will not let the service start: here the notification
    // is all there is, so the ringtone is its own sound.
    val ringtone = NotificationChannel(
      CHANNEL_RINGTONE, "Incoming group calls (notification sound)", NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Used when Android does not let Splix ring by itself"
      setSound(
        Settings.System.DEFAULT_RINGTONE_URI,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      enableVibration(true)
      vibrationPattern = VIBRATION
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val missed = NotificationChannel(CHANNEL_MISSED, "Missed group calls", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "Group calls you did not answer"
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannels(listOf(ringing, ringtone, missed))
  }

  // Opens the app at the group's chat (JavaScript reads the extra).
  private fun openApp(context: Context, call: IncomingCall): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launch.putExtra(EXTRA_OPEN, call.toJson().toString())
    // One pending intent per group, or each would overwrite the last one's extra.
    return PendingIntent.getActivity(context, "call:${call.groupId}".hashCode(), launch, IMMUTABLE)
  }

  /**
   * fullScreen: the phone is locked or showing another app, so Android decides
   * between the call screen and a banner. False when the app itself is on
   * screen: the call screen is opened directly and a banner would only repeat it.
   *
   * alone: there is no service behind it. Then the notification does the
   * ringing, with the channel's sound, and takes itself down when time is up.
   */
  fun ringing(context: Context, call: IncomingCall, fullScreen: Boolean, alone: Boolean = false): Notification {
    ensureChannels(context)
    val callScreen = PendingIntent.getActivity(context, 11, CallActivity.intent(context), IMMUTABLE)
    // Straight to a screen of ours: Android does not let a notification button
    // start a service that then opens the app.
    val answer = PendingIntent.getActivity(context, 12, CallActivity.answerIntent(context), IMMUTABLE)
    val decline = PendingIntent.getBroadcast(
      context, 13, CallReceiver.intent(context, CallReceiver.ACTION_DECLINE), IMMUTABLE
    )
    val group = Person.Builder().setName(call.groupName).setImportant(true).build()

    val builder = NotificationCompat.Builder(context, if (alone) CHANNEL_RINGTONE else CHANNEL_RINGING)
      .setSmallIcon(if (call.video == true) R.drawable.splix_ic_videocam else R.drawable.splix_ic_call)
      .setColor(ACCENT)
      .setContentTitle(call.groupName)
      .setContentText("${call.callerName} · ${call.kind}")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setShowWhen(false)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(callScreen)
      // Swiped away: the same as declining, or it would ring with nothing to stop it.
      .setDeleteIntent(decline)
      .addPerson(group)
      .setStyle(
        NotificationCompat.CallStyle.forIncomingCall(group, decline, answer).setIsVideo(call.video == true)
      )
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

    when {
      alone -> builder
        .setFullScreenIntent(callScreen, true)
        .setTimeoutAfter(CallRules.RING_MS)
        // Before Android 8 there are no channels: the sound belongs to the notification.
        .setSound(Settings.System.DEFAULT_RINGTONE_URI, AudioManager.STREAM_RING)
        .setVibrate(VIBRATION)
      fullScreen -> builder.setFullScreenIntent(callScreen, true).setSound(null)
      else -> builder.setSilent(true)
    }

    val notification = builder.build()
    // Keeps the ringtone going until the call is answered or the time is up.
    if (alone) notification.flags = notification.flags or Notification.FLAG_INSISTENT
    return notification
  }

  // Rings from the notification alone (see [ringing]).
  fun showRingingAlone(context: Context, call: IncomingCall) {
    NotificationManagerCompat.from(context)
      .notify(RINGING_ID, ringing(context, call, fullScreen = true, alone = true))
  }

  fun cancelRinging(context: Context) {
    NotificationManagerCompat.from(context).cancel(RINGING_ID)
  }

  // Whether the ringing notification is still up (it takes itself down when time is up).
  fun isRingingShown(context: Context): Boolean = try {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.activeNotifications.any { it.id == RINGING_ID }
  } catch (_: Exception) {
    false
  }

  fun showMissed(context: Context, call: IncomingCall) {
    show(context, call, "Missed ${call.kind.lowercase()}", "${call.groupName} · ${call.callerName} called") {
      setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
    }
  }

  // The person is on another call: told about this one without ringing over it.
  fun showWaiting(context: Context, call: IncomingCall) {
    show(context, call, call.groupName, "${call.callerName} started a ${call.kind.lowercase()}") {
      setCategory(NotificationCompat.CATEGORY_CALL)
    }
  }

  private fun show(
    context: Context,
    call: IncomingCall,
    title: String,
    text: String,
    more: NotificationCompat.Builder.() -> Unit
  ) {
    ensureChannels(context)
    val notification = NotificationCompat.Builder(context, CHANNEL_MISSED)
      .setSmallIcon(if (call.video == true) R.drawable.splix_ic_videocam else R.drawable.splix_ic_call)
      .setColor(ACCENT)
      .setContentTitle(title)
      .setContentText(text)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setAutoCancel(true)
      .setContentIntent(openApp(context, call))
      .apply(more)
      .build()
    // One per group: a second missed call from the same group replaces the first.
    NotificationManagerCompat.from(context).notify(call.groupId, MISSED_ID, notification)
  }

  // The group is being answered or opened: what was missed there is old news.
  fun cancelMissed(context: Context, groupId: String) {
    NotificationManagerCompat.from(context).cancel(groupId, MISSED_ID)
  }

  // Signing out: nothing about the last person's calls may stay on the screen.
  fun cancelEverything(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      for (shown in manager.activeNotifications) {
        if (shown.id == MISSED_ID || shown.id == RINGING_ID) manager.cancel(shown.tag, shown.id)
      }
    } catch (_: Exception) {
      // Nothing to clear, or the list could not be read: not worth failing a sign-out over.
    }
  }
}
