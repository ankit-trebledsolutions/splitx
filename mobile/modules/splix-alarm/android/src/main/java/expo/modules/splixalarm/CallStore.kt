package expo.modules.splixalarm

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences

/**
 * What has to be remembered about calls beyond the life of the process: a
 * ring usually arrives with the app closed, and the app that then opens to
 * answer it may be a new process.
 *
 *  seen:<groupId>  the newest ring handled for that group (when the server sent it)
 *  ended:<groupId> the newest "the call is over" heard for that group
 *  ringing         the call ringing right now, and until when
 *  answered        the call that was accepted, until JavaScript collects it
 *  signedOut       nobody is signed in, so nothing may ring
 */
@SuppressLint("ApplySharedPref") // commit(): the process may be gone before apply() lands.
class CallStore(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences("splix_calls", Context.MODE_PRIVATE)

  var signedOut: Boolean
    get() = prefs.getBoolean(SIGNED_OUT, false)
    set(value) {
      prefs.edit().putBoolean(SIGNED_OUT, value).commit()
    }

  fun seenAt(groupId: String): Long = prefs.getLong(SEEN + groupId, 0L)

  fun setSeen(groupId: String, at: Long) {
    prefs.edit().putLong(SEEN + groupId, at).commit()
  }

  fun endedAt(groupId: String): Long = prefs.getLong(ENDED + groupId, 0L)

  fun setEnded(groupId: String, at: Long) {
    prefs.edit().putLong(ENDED + groupId, at).commit()
  }

  fun setRinging(call: IncomingCall, until: Long) {
    prefs.edit().putString(RINGING, call.toJson().toString()).putLong(RINGING_UNTIL, until).commit()
  }

  // Null once its time is up, whatever is still written here.
  fun ringing(now: Long): IncomingCall? {
    if (now > prefs.getLong(RINGING_UNTIL, 0L)) return null
    return IncomingCall.fromJsonOrNull(prefs.getString(RINGING, null))
  }

  fun clearRinging() {
    prefs.edit().remove(RINGING).remove(RINGING_UNTIL).commit()
  }

  fun setAnswered(call: IncomingCall, now: Long) {
    prefs.edit().putString(ANSWERED, call.toJson().toString()).putLong(ANSWERED_AT, now).commit()
  }

  /**
   * Handed over once. An answer older than [validMs] is dropped instead: the
   * app must not walk into a call because of a button pressed some time ago.
   */
  fun takeAnswered(now: Long, validMs: Long): IncomingCall? {
    val call = IncomingCall.fromJsonOrNull(prefs.getString(ANSWERED, null)) ?: return null
    val answeredAt = prefs.getLong(ANSWERED_AT, 0L)
    clearAnswered()
    return call.takeIf { now - answeredAt in 0..validMs }
  }

  fun clearAnswered() {
    prefs.edit().remove(ANSWERED).remove(ANSWERED_AT).commit()
  }

  fun clear() {
    prefs.edit().clear().commit()
  }

  private companion object {
    const val SEEN = "seen:"
    const val ENDED = "ended:"
    const val RINGING = "ringing"
    const val RINGING_UNTIL = "ringingUntil"
    const val ANSWERED = "answered"
    const val ANSWERED_AT = "answeredAt"
    const val SIGNED_OUT = "signedOut"
  }
}
