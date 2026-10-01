package expo.modules.splixalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Decides what happens to a group call on this phone: whether it rings, and
 * how the ringing ends. Everything about a call passes through here, from
 * whichever side it comes: a push, the app's own connection, a button on the
 * call screen or on the notification, the clock.
 *
 * The ringing itself is CallService (sound and vibration) with the
 * notification from CallNotifications; the screen is CallActivity. When
 * Android will not let the service start, the notification rings alone.
 *
 * All of it runs on the main thread, so the steps of one decision are never
 * mixed with those of another.
 */
object CallCenter {
  const val RING_MS = CallRules.RING_MS

  // Events, for the call screen and for JavaScript.
  const val RINGING = "ringing"
  const val STOPPED = "stopped"
  const val OPEN = "open"

  // Why the ringing stopped.
  const val REASON_ANSWERED = "answered"
  const val REASON_DECLINED = "declined"
  const val REASON_TIMEOUT = "timeout"
  const val REASON_ENDED = "ended"
  const val REASON_JOINED = "joined"
  const val REASON_SIGNED_OUT = "signedOut"

  // An accepted call is joined by JavaScript once the app is in front. Longer
  // than that takes, and short enough that the app never joins a call because
  // of a button pressed a while ago.
  private const val ANSWER_VALID_MS = 2 * 60_000L

  private const val MAIN_WAIT_SECONDS = 5L

  fun interface Listener {
    fun onCallEvent(type: String, call: IncomingCall, reason: String?)
  }

  /** The call ringing right now. */
  @Volatile
  var current: IncomingCall? = null
    private set

  // The group whose call the person is in, as JavaScript last said.
  @Volatile
  private var inCallGroupId: String? = null

  private val main = Handler(Looper.getMainLooper())
  private val listeners = CopyOnWriteArraySet<Listener>()

  fun add(listener: Listener) {
    listeners.add(listener)
  }

  fun remove(listener: Listener) {
    listeners.remove(listener)
  }

  private fun emit(type: String, call: IncomingCall, reason: String? = null) {
    for (listener in listeners) {
      try {
        listener.onCallEvent(type, call, reason)
      } catch (_: Exception) {
        // One listener failing must not stop the call from being handled.
      }
    }
  }

  /**
   * Runs on the main thread, and returns once it has run. Waiting matters for
   * a push: Android only keeps the phone awake for it until the service that
   * received it returns, and the ringing has to be under way by then.
   */
  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
      return
    }
    val done = CountDownLatch(1)
    main.post {
      try {
        block()
      } finally {
        done.countDown()
      }
    }
    try {
      done.await(MAIN_WAIT_SECONDS, TimeUnit.SECONDS)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
  }

  // ---- A ring arrives ------------------------------------------------------

  /** From a push, or from the app's own connection while it is open. Any thread. */
  fun ring(context: Context, call: IncomingCall) {
    val app = context.applicationContext
    onMain { onRing(app, call) }
  }

  private fun onRing(context: Context, call: IncomingCall) {
    restore(context)
    val store = CallStore(context)
    val now = System.currentTimeMillis()
    val seenAt = store.seenAt(call.groupId)
    val answer = CallRules.decide(
      call = call,
      now = now,
      seenAt = seenAt,
      signedOut = store.signedOut,
      inCallGroupId = inCallGroupId,
      ringing = current,
      phoneBusy = isPhoneBusy(context)
    )
    if (!store.signedOut && call.at > seenAt) store.setSeen(call.groupId, call.at)

    when (answer) {
      RingAnswer.IGNORE -> Unit
      RingAnswer.MISSED -> CallNotifications.showMissed(context, call)
      RingAnswer.WAITING -> CallNotifications.showWaiting(context, call)
      RingAnswer.RING -> startRinging(context, call, now)
    }
  }

  private fun startRinging(context: Context, call: IncomingCall, now: Long) {
    current = call
    CallStore(context).setRinging(call, now + RING_MS)
    // What was missed from this group before is about to be answered, or missed again.
    CallNotifications.cancelMissed(context, call.groupId)

    val onScreen = isAppOnScreen(context)
    if (!CallService.start(context, onScreen)) ringAlone(context, call)

    // With the app in front, the call screen is simply opened on top of it.
    // Otherwise the notification's full-screen intent does the work: the
    // screen when the phone is locked, a banner when it is in use.
    if (onScreen) {
      try {
        context.startActivity(CallActivity.intent(context))
      } catch (_: Exception) {
        // The notification is still there to answer from.
      }
    }
    emit(RINGING, call)
  }

  /**
   * Android would not start the service (it does that for an app in the
   * background unless the push was marked urgent all the way to the phone).
   * The notification rings by itself then, and an alarm ends it on time.
   */
  private fun ringAlone(context: Context, call: IncomingCall) {
    CallNotifications.showRingingAlone(context, call)
    scheduleTimeout(context, System.currentTimeMillis() + RING_MS)
  }

  /** CallService could not become a foreground service after all. */
  fun serviceRefused(context: Context) {
    val app = context.applicationContext
    onMain { current?.let { ringAlone(app, it) } }
  }

  // ---- The ringing ends ----------------------------------------------------

  /** The call is over before it was answered here. Any thread. */
  fun end(context: Context, groupId: String, at: Long) {
    val app = context.applicationContext
    onMain {
      restore(app)
      if (CallRules.endsRing(current, groupId, at)) finish(app, REASON_ENDED)
    }
  }

  fun decline(context: Context) {
    val app = context.applicationContext
    onMain {
      restore(app)
      finish(app, REASON_DECLINED)
    }
  }

  /** Nobody answered. With [expected], only if that is still the call ringing. */
  fun timeout(context: Context, expected: IncomingCall? = null) {
    val app = context.applicationContext
    onMain {
      restore(app)
      finish(app, REASON_TIMEOUT, expected)
    }
  }

  /**
   * Accept was pressed. Returns the call to join, or null when nothing is
   * ringing any more (the button outlived the call). Main thread only.
   */
  fun answer(context: Context): IncomingCall? {
    val app = context.applicationContext
    restore(app)
    return finish(app, REASON_ANSWERED)
  }

  /** The phone was not unlocked after Accept: the call was not joined after all. */
  fun answerAbandoned(context: Context, call: IncomingCall) {
    val app = context.applicationContext
    CallStore(app).clearAnswered()
    CallNotifications.showMissed(app, call)
  }

  /** The accepted call, handed to JavaScript once. */
  fun takeAnswered(context: Context): IncomingCall? =
    CallStore(context.applicationContext).takeAnswered(System.currentTimeMillis(), ANSWER_VALID_MS)

  /**
   * JavaScript says which group's call the person is in (null for none). A
   * call they joined from inside the app stops ringing; one for another group
   * is announced quietly while this lasts.
   */
  fun setInCall(context: Context, groupId: String?) {
    val app = context.applicationContext
    onMain {
      inCallGroupId = groupId
      if (groupId != null) {
        CallNotifications.cancelMissed(app, groupId)
        if (current?.groupId == groupId) finish(app, REASON_JOINED)
      }
    }
  }

  fun signedIn(context: Context) {
    CallStore(context.applicationContext).signedOut = false
  }

  /** Signing out: nothing may ring, or stay on screen, for the next person. */
  fun signedOut(context: Context) {
    val app = context.applicationContext
    onMain {
      restore(app)
      finish(app, REASON_SIGNED_OUT)
      inCallGroupId = null
      CallStore(app).apply {
        clear()
        signedOut = true
      }
      CallNotifications.cancelEverything(app)
    }
  }

  private fun finish(context: Context, reason: String, expected: IncomingCall? = null): IncomingCall? {
    val call = current ?: return null
    if (expected != null && !expected.sameRingAs(call)) return null
    current = null

    val store = CallStore(context)
    store.clearRinging()
    cancelTimeout(context)
    CallService.stop()
    CallNotifications.cancelRinging(context)

    when (reason) {
      REASON_ANSWERED -> store.setAnswered(call, System.currentTimeMillis())
      REASON_TIMEOUT, REASON_ENDED -> CallNotifications.showMissed(context, call)
    }
    emit(STOPPED, call, reason)
    return call
  }

  /**
   * A new process, while a call rings from its notification alone: the
   * notification outlives the process, so its buttons can arrive here with
   * nothing in memory. What is ringing is read back, but only while that
   * notification is really still up.
   */
  private fun restore(context: Context) {
    if (current != null) return
    val store = CallStore(context)
    val stored = store.ringing(System.currentTimeMillis())
    if (stored != null && CallNotifications.isRingingShown(context)) {
      current = stored
    } else if (stored != null) {
      store.clearRinging()
    }
  }

  // ---- Helpers -------------------------------------------------------------

  // On a phone call, or a call in another app: a second ringtone has no place there.
  private fun isPhoneBusy(context: Context): Boolean {
    val mode = (context.getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode
    return mode == AudioManager.MODE_IN_CALL ||
      mode == AudioManager.MODE_IN_COMMUNICATION ||
      mode == AudioManager.MODE_RINGTONE
  }

  private fun timeoutIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    14,
    CallReceiver.intent(context, CallReceiver.ACTION_TIMEOUT),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun scheduleTimeout(context: Context, at: Long) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = timeoutIntent(context)
    try {
      if (AlarmScheduler.canScheduleExact(context)) {
        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
      } else {
        // A little late at worst: the notification stops ringing on time by
        // itself, and this only turns it into "missed".
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
      }
    } catch (_: Exception) {
      // The notification still takes itself down when its time is up.
    }
  }

  private fun cancelTimeout(context: Context) {
    try {
      (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(timeoutIntent(context))
    } catch (_: Exception) {
      // Nothing was set.
    }
  }
}
