package expo.modules.splixalarm

import org.json.JSONObject

/**
 * A group call ringing on this phone.
 *
 * [at] is when the server sent the ring, in epoch milliseconds: together with
 * the group it names the ring, so the same one arriving twice (as a push and
 * over the app's own connection) is recognised. [video] is null when the
 * caller's app is too old to say what kind of call it started.
 */
data class IncomingCall(
  val groupId: String,
  val groupName: String,
  val callerName: String,
  val callerId: String? = null,
  val video: Boolean? = null,
  val at: Long
) {
  /** The kind of call, as the person reads it. */
  val kind: String
    get() = when (video) {
      true -> "Group video call"
      false -> "Group voice call"
      null -> "Group call"
    }

  fun sameRingAs(other: IncomingCall): Boolean = groupId == other.groupId && at == other.at

  fun toJson(): JSONObject = JSONObject().apply {
    put("groupId", groupId)
    put("groupName", groupName)
    put("callerName", callerName)
    put("callerId", callerId ?: JSONObject.NULL)
    put("video", video ?: JSONObject.NULL)
    put("at", at)
  }

  // For JavaScript, whose numbers are doubles.
  fun toMap(): Map<String, Any?> = mapOf(
    "groupId" to groupId,
    "groupName" to groupName,
    "callerName" to callerName,
    "callerId" to callerId,
    "video" to video,
    "at" to at.toDouble()
  )

  companion object {
    private const val NO_GROUP_NAME = "Group"
    private const val NO_CALLER_NAME = "Someone"

    // optString() answers the word "null" for a JSON null.
    private fun JSONObject.text(name: String): String = if (isNull(name)) "" else optString(name)

    /** Null unless it names a group and a time: without those there is nothing to ring for. */
    fun fromJson(json: JSONObject): IncomingCall? {
      val groupId = json.text("groupId")
      val at = json.optLong("at", 0L)
      if (groupId.isEmpty() || at <= 0L) return null
      return IncomingCall(
        groupId = groupId,
        groupName = json.text("groupName").ifEmpty { NO_GROUP_NAME },
        callerName = json.text("callerName").ifEmpty { NO_CALLER_NAME },
        callerId = json.text("callerId").ifEmpty { null },
        video = if (json.isNull("video")) null else json.optBoolean("video"),
        at = at
      )
    }

    fun fromJsonOrNull(text: String?): IncomingCall? = try {
      if (text.isNullOrEmpty()) null else fromJson(JSONObject(text))
    } catch (_: Exception) {
      null
    }

    // From JavaScript.
    fun fromMap(map: Map<String, Any?>): IncomingCall? {
      val groupId = map["groupId"] as? String ?: return null
      val at = (map["at"] as? Number)?.toLong() ?: return null
      if (groupId.isEmpty() || at <= 0L) return null
      return IncomingCall(
        groupId = groupId,
        groupName = (map["groupName"] as? String).orEmpty().ifEmpty { NO_GROUP_NAME },
        callerName = (map["callerName"] as? String).orEmpty().ifEmpty { NO_CALLER_NAME },
        callerId = (map["callerId"] as? String)?.ifEmpty { null },
        video = map["video"] as? Boolean,
        at = at
      )
    }
  }
}

/** What the server tells a phone about a call (backend callRing.service). */
sealed class CallSignal {
  data class Ring(val call: IncomingCall) : CallSignal()

  // The call is over: whoever is still ringing for it stops.
  data class End(val groupId: String, val at: Long) : CallSignal()

  companion object {
    /**
     * Reads a push. Expo's push service delivers the `data` the server sent as
     * JSON text under the key "body". Null for every push that is not about a
     * call, and for one this version does not understand: those go on to be
     * shown as the ordinary notifications they are.
     */
    fun fromPush(data: Map<String, String>): CallSignal? = fromJsonText(data["body"])

    fun fromJsonText(body: String?): CallSignal? {
      if (body.isNullOrEmpty()) return null
      val json = try {
        JSONObject(body)
      } catch (_: Exception) {
        return null
      }
      if (json.optString("type") != "call") return null
      return when (json.optString("action")) {
        "ring" -> IncomingCall.fromJson(json)?.let { Ring(it) }
        "end" -> {
          val groupId = if (json.isNull("groupId")) "" else json.optString("groupId")
          val at = json.optLong("at", 0L)
          if (groupId.isEmpty() || at <= 0L) null else End(groupId, at)
        }
        else -> null
      }
    }
  }
}

/** What to do with a ring that has just arrived. */
enum class RingAnswer { RING, MISSED, WAITING, IGNORE }

/**
 * The decisions about a ring, kept apart from Android so they can be tested
 * (src/test): they decide whether a phone rings at all.
 */
object CallRules {
  // How long a call rings before it counts as missed. The server gives up
  // delivering a ring after the same time (RING_SECONDS in callRing.service).
  const val RING_MS = 45_000L

  // A ring older than this when it arrives is for a call long over. Far longer
  // than RING_MS on purpose: the two times come from different clocks, and a
  // phone whose clock runs a minute fast must still ring.
  const val STALE_MS = 5 * 60_000L

  /**
   * [seenAt]         the newest ring already handled for this group (0 if none)
   * [signedOut]      nobody is signed in on this phone
   * [inCallGroupId]  the group whose call the person is in right now, if any
   * [ringing]        the call ringing right now, if any
   * [phoneBusy]      the phone is on a call of its own (a phone call, another app)
   */
  fun decide(
    call: IncomingCall,
    now: Long,
    seenAt: Long,
    signedOut: Boolean,
    inCallGroupId: String?,
    ringing: IncomingCall?,
    phoneBusy: Boolean
  ): RingAnswer = when {
    signedOut -> RingAnswer.IGNORE
    // The same ring by its other route, or an older one arriving late.
    call.at <= seenAt -> RingAnswer.IGNORE
    // Already in this call, or already ringing for it.
    inCallGroupId == call.groupId -> RingAnswer.IGNORE
    ringing?.groupId == call.groupId -> RingAnswer.IGNORE
    now - call.at > STALE_MS -> RingAnswer.MISSED
    // Busy with another call: told about this one without ringing over it.
    inCallGroupId != null || ringing != null || phoneBusy -> RingAnswer.WAITING
    else -> RingAnswer.RING
  }

  /**
   * Whether "the call is over" stops what is ringing: it must be about the
   * same group, and not older than the ring (an "over" for the call before
   * this one, arriving late, must not silence this one).
   */
  fun endsRing(ringing: IncomingCall?, groupId: String, at: Long): Boolean =
    ringing != null && ringing.groupId == groupId && at >= ringing.at
}
