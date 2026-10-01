package expo.modules.splixalarm

import org.json.JSONObject

/**
 * One reminder as the phone needs it to ring: when, what to show, and where
 * "Open" should lead. Kept as JSON on disk so it is still there after the app
 * is closed or the phone restarts.
 */
data class Alarm(
  // The reminder's id on the server.
  val id: String,
  // The next time it rings, in epoch milliseconds.
  val fireAt: Long,
  val title: String,
  val body: String = "",
  val groupId: String? = null,
  val groupName: String? = null,
  val taskId: String? = null,
  // Name of a sound in res/raw, without extension. See AlarmSound.
  val sound: String = AlarmSound.DEFAULT,
  // 0 rings once; otherwise the gap between rings (a week, for "repeat weekly").
  val repeatMs: Long = 0,
  // 0 repeats with no end; otherwise it stops repeating after this time.
  val repeatUntil: Long = 0,
  // A snoozed ring-again rather than the reminder's own time.
  val snoozed: Boolean = false
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("fireAt", fireAt)
    .put("title", title)
    .put("body", body)
    .put("groupId", groupId ?: JSONObject.NULL)
    .put("groupName", groupName ?: JSONObject.NULL)
    .put("taskId", taskId ?: JSONObject.NULL)
    .put("sound", sound)
    .put("repeatMs", repeatMs)
    .put("repeatUntil", repeatUntil)
    .put("snoozed", snoozed)

  // What JavaScript is handed: the same fields, as plain values.
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "fireAt" to fireAt.toDouble(),
    "title" to title,
    "body" to body,
    "groupId" to groupId,
    "groupName" to groupName,
    "taskId" to taskId,
    "sound" to sound,
    "repeatMs" to repeatMs.toDouble(),
    "repeatUntil" to repeatUntil.toDouble(),
    "snoozed" to snoozed
  )

  /**
   * The time this should next ring, counted from [now]: its own time while that
   * is still ahead, otherwise the next repeat. Null when there is nothing left
   * to ring (a one-off whose time has passed, or a repeat that has run out).
   */
  fun nextAfter(now: Long): Long? {
    if (fireAt > now) return fireAt
    if (repeatMs < MIN_REPEAT_MS) return null
    val next = fireAt + ((now - fireAt) / repeatMs + 1) * repeatMs
    return if (repeatUntil > 0 && next > repeatUntil) null else next
  }

  /**
   * Its time has come but Android has not rung it yet, and it is not too late
   * to. Without the exact-alarm permission delivery can be minutes behind, and
   * after a force stop it never comes at all.
   */
  fun isOverdue(now: Long): Boolean = fireAt <= now && now - fireAt <= LATE_LIMIT_MS

  /**
   * Whether [other] is this same reminder at the same time, or (for a repeating
   * one) another turn of the same weekly rhythm, rather than a reminder whose
   * time was changed by a person.
   */
  fun sameSeriesAs(other: Alarm): Boolean =
    fireAt == other.fireAt ||
      (other.repeatMs >= MIN_REPEAT_MS && (other.fireAt - fireAt) % other.repeatMs == 0L)

  companion object {
    // Rung later than this it would only confuse: it becomes a "Missed reminder".
    const val LATE_LIMIT_MS = 30 * 60 * 1000L

    // Anything shorter is not a repeat a person asked for.
    private const val MIN_REPEAT_MS = 60_000L

    fun fromJson(json: JSONObject): Alarm = Alarm(
      id = json.getString("id"),
      fireAt = json.getLong("fireAt"),
      title = json.optString("title"),
      body = json.optString("body"),
      groupId = json.optStringOrNull("groupId"),
      groupName = json.optStringOrNull("groupName"),
      taskId = json.optStringOrNull("taskId"),
      sound = json.optString("sound", AlarmSound.DEFAULT),
      repeatMs = json.optLong("repeatMs", 0),
      repeatUntil = json.optLong("repeatUntil", 0),
      snoozed = json.optBoolean("snoozed", false)
    )

    fun fromJsonOrNull(text: String?): Alarm? = try {
      if (text.isNullOrEmpty()) null else fromJson(JSONObject(text))
    } catch (_: Exception) {
      null
    }

    // From JavaScript, where every number is a double.
    fun fromMap(map: Map<String, Any?>): Alarm = Alarm(
      id = map["id"] as String,
      fireAt = (map["fireAt"] as Number).toLong(),
      title = (map["title"] as? String).orEmpty(),
      body = (map["body"] as? String).orEmpty(),
      groupId = map["groupId"] as? String,
      groupName = map["groupName"] as? String,
      taskId = map["taskId"] as? String,
      sound = (map["sound"] as? String) ?: AlarmSound.DEFAULT,
      repeatMs = (map["repeatMs"] as? Number)?.toLong() ?: 0,
      repeatUntil = (map["repeatUntil"] as? Number)?.toLong() ?: 0
    )

    private fun JSONObject.optStringOrNull(key: String): String? =
      if (isNull(key)) null else optString(key).ifEmpty { null }
  }
}
