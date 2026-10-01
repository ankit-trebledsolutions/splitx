package expo.modules.splixalarm

import android.animation.Animator
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The alarm screen. Drawn natively rather than in React Native so it is on
 * screen the moment the alarm rings, even with the app fully closed, and it
 * shows over the lock screen without unlocking the phone.
 *
 * It only shows and answers the alarm; the ringing itself is AlarmService.
 */
class AlarmActivity : Activity() {
  private var alarm: Alarm? = null
  private val animators = mutableListOf<Animator>()

  // "Open in Splix" was pressed and the phone is being unlocked.
  private var opening = false

  private val listener = AlarmEvents.Listener { type, stopped, reason ->
    if (type == AlarmEvents.STOPPED) runOnUiThread { onAlarmStopped(stopped, reason) }
  }

  private fun onAlarmStopped(stopped: Alarm, reason: String?) {
    when {
      // Another reminder took over: the service refreshes this screen with it.
      reason == AlarmEvents.REASON_REPLACED -> Unit
      // Closing now would abandon the unlock; its callbacks close the screen.
      opening -> Unit
      // Answered from the notification, or timed out: nothing left to show.
      stopped.id == alarm?.id -> close()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.splix_alarm_activity)
    fitSystemBars()
    ignoreBack()

    findViewById<View>(R.id.splix_alarm_dismiss).setOnClickListener {
      answer(AlarmService.ACTION_DISMISS)
      close()
    }
    findViewById<TextView>(R.id.splix_alarm_snooze).apply {
      text = "Snooze ${AlarmService.SNOOZE_MINUTES} min"
      setOnClickListener {
        answer(AlarmService.ACTION_SNOOZE)
        close()
      }
    }
    findViewById<View>(R.id.splix_alarm_open).setOnClickListener { openApp() }

    AlarmEvents.add(listener)
    show()
    startPulse()
  }

  // singleInstance: a second alarm reuses this screen.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    show()
  }

  override fun onStart() {
    super.onStart()
    showing = true
  }

  override fun onStop() {
    showing = false
    super.onStop()
  }

  /**
   * Shows the alarm that is ringing right now, whichever intent brought the
   * screen up: the service is the one that knows, and an intent can be stale.
   */
  private fun show() {
    val next = AlarmService.current
    if (next == null) {
      // Opened from an old notification, or the alarm stopped while this was starting.
      if (!opening) close()
      return
    }
    alarm = next

    findViewById<TextView>(R.id.splix_alarm_label).text =
      if (next.snoozed) "SNOOZED REMINDER" else "REMINDER"
    findViewById<TextView>(R.id.splix_alarm_time).text = AlarmNotifications.timeText(this, next.fireAt)
    findViewById<TextView>(R.id.splix_alarm_title).text = next.title
    setOrHide(R.id.splix_alarm_body, next.body)
    setOrHide(R.id.splix_alarm_group, next.groupName.orEmpty())
  }

  private fun setOrHide(id: Int, value: String) {
    val view = findViewById<TextView>(id)
    view.text = value
    view.visibility = if (value.isEmpty()) View.GONE else View.VISIBLE
  }

  private fun answer(action: String) {
    AlarmService.answered()
    try {
      startService(AlarmService.actionIntent(this, action))
    } catch (_: Exception) {
      // The service is already gone, which means the alarm has stopped.
    }
  }

  /**
   * "Open in Splix": stop the alarm, then bring the app up at whatever the
   * reminder is about. From the lock screen the phone has to be unlocked first.
   */
  private fun openApp() {
    if (opening) return
    val opened = alarm ?: return close()
    val store = AlarmStore(this)
    // JavaScript collects this when the app comes to the front.
    store.setOpen(opened)
    // Before the alarm is stopped: stopping it would otherwise close this
    // screen, and Android drops the unlock request of a screen that has gone.
    opening = true
    answer(AlarmService.ACTION_OPEN)

    val launch = packageManager.getLaunchIntentForPackage(packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val start = {
      try {
        if (launch != null) startActivity(launch)
      } catch (_: Exception) {
        // Nothing to open; the alarm is dismissed either way.
      }
      close()
    }
    // They backed out of unlocking: do not jump there the next time the app opens.
    val giveUp = {
      store.takeOpen()
      close()
    }

    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = start()
        override fun onDismissCancelled() = giveUp()
        override fun onDismissError() = giveUp()
      })
      // Android does not always say when an unlock is abandoned (the screen
      // just times out). This screen must not be left over the lock screen.
      window.decorView.postDelayed({ if (!isFinishing && !isDestroyed) giveUp() }, UNLOCK_WAIT_MS)
    } else {
      start()
    }
  }

  private fun close() {
    if (!isFinishing) finishAndRemoveTask()
  }

  override fun onDestroy() {
    AlarmEvents.remove(listener)
    animators.forEach { it.cancel() }
    animators.clear()
    super.onDestroy()
  }

  // ---- Window --------------------------------------------------------------

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // Draws behind the status and navigation bars and pads the content clear of them.
  private fun fitSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val root = findViewById<View>(R.id.splix_alarm_root)
    val left = root.paddingLeft
    val top = root.paddingTop
    val right = root.paddingRight
    val bottom = root.paddingBottom
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(left + bars.left, top + bars.top, right + bars.right, bottom + bars.bottom)
      insets
    }
  }

  // An alarm is answered with its buttons, not swiped away by accident.
  private fun ignoreBack() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {}
    }
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    // See ignoreBack().
  }

  // ---- The pulsing rings around the bell -----------------------------------

  private fun startPulse() {
    pulse(findViewById(R.id.splix_alarm_ring_outer), delay = 0)
    pulse(findViewById(R.id.splix_alarm_ring_inner), delay = PULSE_MS / 2)
  }

  private fun pulse(ring: View, delay: Long) {
    val grow = { property: String ->
      ObjectAnimator.ofFloat(ring, property, 0.6f, 1.2f).apply {
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.RESTART
      }
    }
    val fade = ObjectAnimator.ofFloat(ring, "alpha", 0.9f, 0f).apply {
      repeatCount = ValueAnimator.INFINITE
      repeatMode = ValueAnimator.RESTART
    }
    val set = AnimatorSet().apply {
      playTogether(grow("scaleX"), grow("scaleY"), fade)
      duration = PULSE_MS
      startDelay = delay
      interpolator = AccelerateDecelerateInterpolator()
    }
    animators.add(set)
    set.start()
  }

  companion object {
    private const val PULSE_MS = 1800L
    private const val UNLOCK_WAIT_MS = 60_000L

    /**
     * Whether the alarm screen is up. With it up the app has a visible window,
     * which is what lets the service refresh it for a second alarm; Android
     * shows a notification's full-screen intent only the first time it is posted.
     */
    @Volatile
    var showing = false
      private set

    // Carries nothing: the screen reads what is ringing from the service.
    fun intent(context: Context): Intent =
      Intent(context, AlarmActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
  }
}
