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
import android.widget.ImageView
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The incoming call screen. Drawn natively rather than in React Native so it
 * is on screen the moment the call rings, even with the app fully closed, and
 * it shows over the lock screen without unlocking the phone.
 *
 * It only shows the call and takes the answer. Accepting opens the app, which
 * joins the call; from the lock screen the phone has to be unlocked first.
 */
class CallActivity : Activity() {
  private var call: IncomingCall? = null
  private val animators = mutableListOf<Animator>()

  // Accept was pressed: the app is being opened, perhaps after an unlock.
  private var opening = false

  private val listener = CallCenter.Listener { type, stopped, _ ->
    if (type == CallCenter.STOPPED) runOnUiThread { onCallStopped(stopped) }
  }

  // The screen keeps its own clock as well: with the notification ringing
  // alone, the alarm that ends the ring may come a little late.
  private val giveUp = Runnable { call?.let { CallCenter.timeout(this, it) } }

  private fun onCallStopped(stopped: IncomingCall) {
    // Closing while the app is being opened would abandon the unlock; its
    // callbacks close the screen.
    if (!opening && call?.sameRingAs(stopped) == true) close()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.splix_call_activity)
    fitSystemBars()
    ignoreBack()

    findViewById<View>(R.id.splix_call_accept).setOnClickListener { accept() }
    findViewById<View>(R.id.splix_call_decline).setOnClickListener {
      CallCenter.decline(this)
      close()
    }

    CallCenter.add(listener)
    startPulse()
    handle(intent)
  }

  // singleInstance: the Answer button on the notification reuses a screen that is already up.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handle(intent)
  }

  private fun handle(intent: Intent?) {
    if (opening) return
    if (intent?.action == ACTION_ANSWER) {
      // Used once: the screen coming back later must not answer again.
      intent.action = null
      accept()
    } else {
      show()
    }
  }

  /**
   * Shows the call that is ringing right now, whichever intent brought the
   * screen up: CallCenter is the one that knows, and an intent can be stale.
   */
  private fun show() {
    val next = CallCenter.current
    if (next == null) {
      // Opened from an old notification, or the call stopped while this was starting.
      close()
      return
    }
    call = next
    fill(next)

    val root = window.decorView
    root.removeCallbacks(giveUp)
    root.postDelayed(giveUp, CallCenter.RING_MS)
  }

  private fun fill(shown: IncomingCall) {
    findViewById<TextView>(R.id.splix_call_label).text = "INCOMING ${shown.kind.uppercase()}"
    findViewById<TextView>(R.id.splix_call_initials).text = initials(shown.groupName)
    findViewById<TextView>(R.id.splix_call_group).text = shown.groupName
    findViewById<TextView>(R.id.splix_call_caller).text =
      if (shown.callerName.isEmpty()) "" else "${shown.callerName} is calling"
    findViewById<ImageView>(R.id.splix_call_accept).setImageResource(
      if (shown.video == true) R.drawable.splix_ic_videocam else R.drawable.splix_ic_call
    )
  }

  // The same letters the app shows for the group: the first of its first two words.
  private fun initials(name: String): String =
    name.split(' ').filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1) }.uppercase()

  /**
   * Accept: the ringing stops, and the app is opened to join the call. From
   * the lock screen the phone has to be unlocked first.
   */
  private fun accept() {
    if (opening) return
    // Before the ringing is stopped: stopping it would otherwise close this
    // screen, and Android drops the unlock request of a screen that has gone.
    opening = true
    val answered = CallCenter.answer(this)
    if (answered == null) {
      // The button outlived the call.
      close()
      return
    }
    call = answered
    window.decorView.removeCallbacks(giveUp)
    fill(answered)
    findViewById<View>(R.id.splix_call_buttons).visibility = View.INVISIBLE

    val launch = packageManager.getLaunchIntentForPackage(packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val start = {
      try {
        if (launch != null) startActivity(launch)
      } catch (_: Exception) {
        // Nothing to open: the call can still be joined from the group's chat.
      }
      close()
    }
    // They backed out of unlocking: the call was not joined after all.
    val giveUpOpening = {
      CallCenter.answerAbandoned(this, answered)
      close()
    }

    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard.isKeyguardLocked) {
      setStatus("Unlock to join the call")
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = start()
        override fun onDismissCancelled() = giveUpOpening()
        override fun onDismissError() = giveUpOpening()
      })
      // Android does not always say when an unlock is abandoned (the screen
      // just times out). This screen must not be left over the lock screen.
      window.decorView.postDelayed({ if (!isFinishing && !isDestroyed) giveUpOpening() }, UNLOCK_WAIT_MS)
    } else {
      setStatus("Joining…")
      start()
    }
  }

  private fun setStatus(text: String) {
    findViewById<TextView>(R.id.splix_call_status).apply {
      this.text = text
      visibility = View.VISIBLE
    }
  }

  private fun close() {
    if (!isFinishing) finishAndRemoveTask()
  }

  override fun onDestroy() {
    CallCenter.remove(listener)
    window.decorView.removeCallbacks(giveUp)
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
    val root = findViewById<View>(R.id.splix_call_root)
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

  // A call is answered with its buttons, not swiped away by accident.
  private fun ignoreBack() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {}
    }
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    // See ignoreBack().
  }

  // ---- The pulsing rings around the group -----------------------------------

  private fun startPulse() {
    pulse(findViewById(R.id.splix_call_ring_outer), delay = 0)
    pulse(findViewById(R.id.splix_call_ring_inner), delay = PULSE_MS / 2)
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
    private const val ACTION_ANSWER = "expo.modules.splixalarm.CALL_ANSWER"
    private const val PULSE_MS = 1800L
    private const val UNLOCK_WAIT_MS = 60_000L

    // Carries nothing: the screen reads what is ringing from CallCenter.
    fun intent(context: Context): Intent =
      Intent(context, CallActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)

    // The Answer button on the notification: opens the screen already answered.
    fun answerIntent(context: Context): Intent = intent(context).setAction(ACTION_ANSWER)
  }
}
