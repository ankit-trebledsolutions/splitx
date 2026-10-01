package expo.modules.splixalarm

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What JavaScript can ask of the alarm clock: which alarms to hold, what the
 * phone allows, and what happened while the app was not running.
 *
 * JavaScript decides which reminders ring (it knows the account and the
 * server); this side only keeps them set and rings them.
 */
class SplixAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val store: AlarmStore
    get() = AlarmStore(context)

  // The service's news, passed on to JavaScript while the app is running.
  private val listener = AlarmEvents.Listener { type, alarm, reason ->
    notifyJs(type, alarm, reason)
  }

  private fun notifyJs(type: String, alarm: Alarm, reason: String? = null) {
    try {
      sendEvent(EVENT, mapOf("type" to type, "reason" to reason, "alarm" to alarm.toMap()))
    } catch (_: Exception) {
      // No JavaScript to tell (the app is closed). It asks when it next starts.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SplixAlarm")

    Events(EVENT)

    OnCreate {
      AlarmEvents.add(listener)
    }

    OnDestroy {
      AlarmEvents.remove(listener)
    }

    // A tap on a missed or plain reminder while the app was already running.
    OnNewIntent { intent ->
      val alarm = Alarm.fromJsonOrNull(intent.getStringExtra(AlarmNotifications.EXTRA_OPEN))
      if (alarm != null) {
        intent.removeExtra(AlarmNotifications.EXTRA_OPEN)
        store.setOpen(alarm)
        notifyJs(AlarmEvents.OPEN, alarm)
      }
    }

    /**
     * What the phone currently allows. The two "...IsSetting" flags say whether
     * that permission is a switch in Android's settings on this version; where
     * it is not, it is always granted and there is nothing to ask for.
     */
    Function("getPermissions") {
      mapOf(
        "notifications" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "exactAlarm" to AlarmScheduler.canScheduleExact(context),
        "exactAlarmIsSetting" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S),
        "fullScreen" to canUseFullScreen(),
        "fullScreenIsSetting" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
      )
    }

    // kind: "exactAlarm" | "fullScreen" | "notifications" | "app". True if a page opened.
    AsyncFunction("openSettings") { kind: String ->
      openSettings(kind)
    }

    /**
     * Makes the phone hold exactly these alarms: new ones are set, changed ones
     * moved, and anything not in the list is dropped. Returns the ids that now
     * have an alarm waiting (one whose time has passed is left out).
     */
    AsyncFunction("sync") { alarms: List<Map<String, Any?>> ->
      val wanted = alarms.mapNotNull { parse(it) }
      val keep = wanted.map { it.id }.toSet()
      synchronized(AlarmStore.lock) {
        for (existing in store.alarms()) if (existing.id !in keep) forget(existing.id)
        for (snooze in store.snoozes()) if (snooze.id !in keep) forget(snooze.id)
        wanted.filter { place(it) }.map { it.id }
      }
    }

    // One alarm set or moved, leaving the rest alone. True if it is now waiting.
    AsyncFunction("upsert") { alarm: Map<String, Any?> ->
      val parsed = parse(alarm)
      parsed != null && synchronized(AlarmStore.lock) { place(parsed) }
    }

    AsyncFunction("remove") { id: String ->
      synchronized(AlarmStore.lock) { forget(id) }
    }

    // Signing out: nothing may ring for the next person to use the phone.
    AsyncFunction("clear") {
      synchronized(AlarmStore.lock) {
        val ids = (store.alarms() + store.snoozes()).map { it.id }.toSet()
        for (id in ids) forget(id)
        stopRinging()
        store.clear()
        // Including "Missed reminder" for ones that already rang and are no
        // longer on the list: they name the last person's reminders.
        AlarmNotifications.cancelEverything(context)
      }
    }

    Function("getScheduled") {
      store.alarms().sortedBy { it.fireAt }.map { it.toMap() }
    }

    Function("getRinging") {
      AlarmService.current?.toMap()
    }

    AsyncFunction("stopRinging") {
      stopRinging()
    }

    /**
     * Puts the alarm screen in front if an alarm is ringing. For when the app
     * is opened mid-ring: from the banner Android shows while another app is in
     * use, or with notifications off, the alarm would otherwise have no screen
     * to be answered from. True if there was one to show.
     */
    AsyncFunction("showRinging") {
      val activity = appContext.currentActivity
      if (AlarmService.current == null || activity == null) {
        false
      } else {
        activity.startActivity(AlarmActivity.intent(activity))
        true
      }
    }

    /**
     * Where the app should go because of an alarm: "Open in Splix" on the alarm
     * screen, or a tap on a missed reminder. Handed over once.
     */
    Function("takeOpen") {
      val stored = store.takeOpen()
      val intent = appContext.currentActivity?.intent
      val carried = Alarm.fromJsonOrNull(intent?.getStringExtra(AlarmNotifications.EXTRA_OPEN))
      if (carried != null) intent?.removeExtra(AlarmNotifications.EXTRA_OPEN)
      (stored ?: carried)?.toMap()
    }
  }

  private fun parse(map: Map<String, Any?>): Alarm? = try {
    Alarm.fromMap(map)
  } catch (_: Exception) {
    null
  }

  // Stores and schedules the alarm's next ring. False when there is none left.
  private fun place(alarm: Alarm): Boolean {
    val now = System.currentTimeMillis()
    val waiting = store.alarm(alarm.id)

    if (waiting != null && waiting.fireAt <= now && waiting.sameSeriesAs(alarm)) {
      // The phone was still waiting to ring this reminder and its time has
      // come: Android delivers late without the exact-alarm permission, and
      // not at all after a force stop. Dropping it here, or moving a weekly
      // one on a week, would lose the ring without a trace.
      if (waiting.isOverdue(now)) {
        // Asked for again instead: a time already past is delivered at once,
        // and the receiver then takes it off the list as usual.
        AlarmScheduler.schedule(context, waiting)
        return true
      }
      AlarmScheduler.reportMissed(context, waiting, now)
    }

    val next = alarm.nextAfter(now)
    if (next == null) {
      // Its time has passed. A snooze still waiting for it is left to ring.
      store.removeAlarm(alarm.id)
      AlarmScheduler.cancel(context, alarm.id)
      return false
    }
    val upcoming = alarm.copy(fireAt = next)
    store.putAlarm(upcoming)
    AlarmScheduler.schedule(context, upcoming)
    // Refreshes what a waiting snooze shows, in case the reminder was renamed.
    store.snooze(alarm.id)?.let { snooze ->
      store.putSnooze(upcoming.copy(fireAt = snooze.fireAt, snoozed = true))
    }
    return true
  }

  // The reminder is gone or switched off: nothing about it may ring or linger.
  private fun forget(id: String) {
    store.removeAlarm(id)
    store.removeSnooze(id)
    AlarmScheduler.cancel(context, id, AlarmScheduler.KIND_ALARM)
    AlarmScheduler.cancel(context, id, AlarmScheduler.KIND_SNOOZE)
    AlarmNotifications.cancelFor(context, id)
    if (AlarmService.current?.id == id) stopRinging()
  }

  private fun stopRinging() {
    if (AlarmService.current == null) return
    try {
      context.startService(AlarmService.actionIntent(context, AlarmService.ACTION_DISMISS))
    } catch (_: Exception) {
      // The service has already stopped.
    }
  }

  private fun canUseFullScreen(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.canUseFullScreenIntent()
  }

  private fun openSettings(kind: String): Boolean {
    val packageUri = Uri.parse("package:${context.packageName}")
    val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    val page = when (kind) {
      "exactAlarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri)
        } else {
          appDetails
        }
      "fullScreen" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
        } else {
          appDetails
        }
      "notifications" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else {
          appDetails
        }
      else -> appDetails
    }
    return launch(page) || (page !== appDetails && launch(appDetails))
  }

  private fun launch(intent: Intent): Boolean = try {
    val from = appContext.currentActivity
    if (from != null) {
      from.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    true
  } catch (_: ActivityNotFoundException) {
    false
  } catch (_: SecurityException) {
    false
  }

  private companion object {
    const val EVENT = "onAlarmEvent"
  }
}
