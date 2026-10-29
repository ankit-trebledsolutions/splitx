package expo.modules.splixalarm

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences

/**
 * The alarms this phone has set, on disk.
 *
 * Android forgets every scheduled alarm when the phone restarts, and the app
 * is usually not running when one rings, so the list cannot live in memory:
 * the receivers read it from here.
 *
 *  alarm:<id>   a reminder waiting for its time
 *  snooze:<id>  a snoozed reminder waiting to ring again
 *  ringing      the one ringing right now, if any
 *  open         where "Open" should lead, until JavaScript collects it
 */
@SuppressLint("ApplySharedPref") // commit(): a receiver's process may be gone before apply() lands.
class AlarmStore(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences("splix_alarms", Context.MODE_PRIVATE)

  fun alarms(): List<Alarm> = all(ALARM)
  fun snoozes(): List<Alarm> = all(SNOOZE)

  fun alarm(id: String): Alarm? = Alarm.fromJsonOrNull(prefs.getString(ALARM + id, null))
  fun snooze(id: String): Alarm? = Alarm.fromJsonOrNull(prefs.getString(SNOOZE + id, null))

  fun putAlarm(alarm: Alarm) = put(ALARM + alarm.id, alarm)
  fun putSnooze(alarm: Alarm) = put(SNOOZE + alarm.id, alarm)

  fun removeAlarm(id: String) = remove(ALARM + id)
  fun removeSnooze(id: String) = remove(SNOOZE + id)

  var ringing: Alarm?
    get() = Alarm.fromJsonOrNull(prefs.getString(RINGING, null))
    set(value) {
      if (value == null) remove(RINGING) else put(RINGING, value)
    }

  fun setOpen(alarm: Alarm) = put(OPEN, alarm)

  // Handed over once: asking again returns nothing.
  fun takeOpen(): Alarm? {
    val alarm = Alarm.fromJsonOrNull(prefs.getString(OPEN, null))
    if (alarm != null) remove(OPEN)
    return alarm
  }

  fun clear() {
    prefs.edit().clear().commit()
  }

  private fun all(prefix: String): List<Alarm> =
    prefs.all.entries
      .filter { it.key.startsWith(prefix) }
      .mapNotNull { Alarm.fromJsonOrNull(it.value as? String) }

  private fun put(key: String, alarm: Alarm) {
    prefs.edit().putString(key, alarm.toJson().toString()).commit()
  }

  private fun remove(key: String) {
    prefs.edit().remove(key).commit()
  }

  companion object {
    /**
     * Held around every "read the list, decide, write it back and set the
     * system alarm" step. JavaScript syncs on its own thread while the receiver
     * fires on the main one; without this, a sync landing in the same instant
     * an alarm fires could put the alarm straight back and ring it twice.
     */
    val lock = Any()

    private const val ALARM = "alarm:"
    private const val SNOOZE = "snooze:"
    private const val RINGING = "ringing"
    private const val OPEN = "open"
  }
}
