package expo.modules.splixalarm

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.ServiceCompat

/**
 * Rings one alarm: sound on the alarm volume, vibration, and the notification
 * that carries the alarm screen. Runs as a foreground service so Android keeps
 * it alive with the app closed.
 *
 * It stops when the person answers (Dismiss, Snooze, Open) or after RING_MS
 * with no answer, which leaves a "Missed reminder" behind.
 */
class AlarmService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val giveUp = Runnable { finish(AlarmEvents.REASON_TIMEOUT) }

  private var ringing: Alarm? = null
  private var player: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null

  // The newest start request seen. Stopping "as of" it, rather than outright,
  // keeps the service alive when a later request (another reminder coming due
  // as this one ends) is already on its way, so that one still rings.
  private var lastStartId = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    when (intent?.action) {
      ACTION_RING -> ring(Alarm.fromJsonOrNull(intent.getStringExtra(EXTRA_ALARM)))
      ACTION_SNOOZE -> finish(AlarmEvents.REASON_SNOOZED)
      ACTION_DISMISS -> finish(AlarmEvents.REASON_DISMISSED)
      ACTION_OPEN -> finish(AlarmEvents.REASON_OPENED)
      // Restarted by Android with nothing to do.
      else -> if (ringing == null) stopSelf(startId)
    }
    // If the process is killed mid-ring, do not come back with a stale alarm.
    return START_NOT_STICKY
  }

  private fun ring(alarm: Alarm?) {
    if (alarm == null) {
      // Nothing readable to ring. If nothing else is ringing either, the
      // service still has to become a foreground one before it may stop.
      if (ringing == null) {
        enterForeground(AlarmNotifications.ringing(this, PLACEHOLDER, fullScreen = false))
        finish(AlarmEvents.REASON_DISMISSED)
      }
      return
    }

    // A second reminder came due while one was ringing: the first becomes missed.
    ringing?.takeIf { it.id != alarm.id }?.let { previous ->
      AlarmNotifications.showMissed(this, previous)
      AlarmEvents.emit(AlarmEvents.STOPPED, previous, AlarmEvents.REASON_REPLACED)
    }
    stopAlerting()

    // Before the notification goes up: its full-screen intent opens the alarm
    // screen, and the screen shows whatever this says is ringing.
    ringing = alarm
    current = alarm
    AlarmStore(this).ringing = alarm

    val appOnScreen = isAppOnScreen(this)
    if (!enterForeground(AlarmNotifications.ringing(this, alarm, fullScreen = !appOnScreen))) {
      // Android refused the foreground service: fall back to a plain notification.
      AlarmNotifications.showPlain(this, alarm)
      clearRinging()
      stopSelf(lastStartId)
      return
    }

    holdWakeLock()
    startSound(alarm)
    startVibration()

    // With the app in front, the alarm screen is simply opened on top of it.
    // With the alarm screen already up (for the reminder this one replaces) it
    // is refreshed the same way: Android shows a notification's full-screen
    // intent only the first time it is posted. Otherwise that intent does the
    // work: the screen when the phone is locked, a banner when it is in use.
    if (appOnScreen || AlarmActivity.showing) {
      try {
        startActivity(AlarmActivity.intent(this))
      } catch (_: Exception) {
        // The notification is still there to answer from.
      }
    }

    handler.removeCallbacks(giveUp)
    handler.postDelayed(giveUp, RING_MS)
    AlarmEvents.emit(AlarmEvents.FIRED, alarm)
  }

  private fun finish(reason: String) {
    val alarm = ringing
    handler.removeCallbacks(giveUp)
    stopAlerting()
    clearRinging()

    if (alarm != null) {
      when (reason) {
        AlarmEvents.REASON_SNOOZED -> synchronized(AlarmStore.lock) {
          val again = alarm.copy(fireAt = System.currentTimeMillis() + SNOOZE_MS, snoozed = true)
          AlarmStore(this).putSnooze(again)
          AlarmScheduler.schedule(this, again, AlarmScheduler.KIND_SNOOZE)
          AlarmNotifications.showSnoozed(this, again)
        }
        AlarmEvents.REASON_TIMEOUT -> AlarmNotifications.showMissed(this, alarm)
      }
      AlarmEvents.emit(AlarmEvents.STOPPED, alarm, reason)
    }

    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf(lastStartId)
  }

  private fun clearRinging() {
    ringing = null
    current = null
    AlarmStore(this).ringing = null
  }

  /**
   * "systemExempted" is the service type for carrying on an alarm, and needs
   * the exact-alarm permission. Without that permission the app can still ring
   * while it is open, as a "shortService" (three minutes at most, which a
   * one-minute ring fits inside).
   */
  private fun enterForeground(notification: Notification): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return tryForeground(notification, 0)
    }
    val exempted = ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
    val short = ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
    val first = if (AlarmScheduler.canScheduleExact(this)) exempted else short
    val second = if (first == exempted) short else exempted
    return tryForeground(notification, first) || tryForeground(notification, second)
  }

  private fun tryForeground(notification: Notification, type: Int): Boolean = try {
    ServiceCompat.startForeground(this, AlarmNotifications.RINGING_ID, notification, type)
    true
  } catch (_: Exception) {
    false
  }

  // A "shortService" that outstays its welcome is stopped by Android this way.
  override fun onTimeout(startId: Int) {
    finish(AlarmEvents.REASON_TIMEOUT)
  }

  override fun onDestroy() {
    handler.removeCallbacks(giveUp)
    stopAlerting()
    if (ringing != null) clearRinging()
    super.onDestroy()
  }

  // ---- Sound ---------------------------------------------------------------

  // USAGE_ALARM puts it on the alarm volume: it is heard with the phone on
  // silent and through Do Not Disturb, exactly like the Clock app.
  private val alarmAudio: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private fun startSound(alarm: Alarm) {
    requestAudioFocus()
    play(AlarmSound.uriFor(this, alarm.sound), fallBack = true)
  }

  private fun play(uri: Uri, fallBack: Boolean) {
    val next = MediaPlayer()
    player = next
    try {
      next.setAudioAttributes(alarmAudio)
      next.setDataSource(this, uri)
      next.isLooping = true
      next.setOnPreparedListener { ready ->
        // Mid-call, ring quietly rather than over the conversation.
        if (isInCall()) ready.setVolume(IN_CALL_VOLUME, IN_CALL_VOLUME)
        // Stopped while it was still loading.
        if (player === ready) ready.start()
      }
      next.setOnErrorListener { failed, _, _ ->
        if (player === failed) {
          releasePlayer()
          if (fallBack) play(AlarmSound.systemDefault(), fallBack = false)
        }
        true
      }
      next.prepareAsync()
    } catch (_: Exception) {
      releasePlayer()
      if (fallBack) play(AlarmSound.systemDefault(), fallBack = false)
    }
  }

  private fun isInCall(): Boolean {
    val mode = (getSystemService(Context.AUDIO_SERVICE) as AudioManager).mode
    return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION
  }

  private fun releasePlayer() {
    val old = player ?: return
    player = null
    try {
      old.setOnPreparedListener(null)
      old.setOnErrorListener(null)
      old.release()
    } catch (_: Exception) {
      // Already released.
    }
  }

  private fun requestAudioFocus() {
    val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(alarmAudio)
        .build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonAudioFocus() {
    val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audio.abandonAudioFocus(null)
    }
  }

  // ---- Vibration -----------------------------------------------------------

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

  private fun startVibration() {
    val vibrator = vibrator()?.takeIf { it.hasVibrator() } ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        vibrator.vibrate(
          VibrationEffect.createWaveform(VIBRATION, 0),
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM)
        )
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), alarmAudio)
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(VIBRATION, 0)
      }
    } catch (_: Exception) {
      // No vibration is not worth losing the alarm over.
    }
  }

  // ---- Staying awake -------------------------------------------------------

  private fun holdWakeLock() {
    releaseWakeLock()
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "splix:alarm-ringing").apply {
      setReferenceCounted(false)
      // Released when the ring ends; the limit is only a safety net.
      acquire(RING_MS + 10_000L)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.takeIf { it.isHeld }?.release()
    } catch (_: Exception) {
      // Timed out already.
    }
    wakeLock = null
  }

  private fun stopAlerting() {
    releasePlayer()
    abandonAudioFocus()
    try {
      vibrator()?.cancel()
    } catch (_: Exception) {
      // Nothing was vibrating.
    }
    releaseWakeLock()
  }

  companion object {
    const val ACTION_RING = "expo.modules.splixalarm.RING"
    const val ACTION_SNOOZE = "expo.modules.splixalarm.SNOOZE"
    const val ACTION_DISMISS = "expo.modules.splixalarm.DISMISS"
    const val ACTION_OPEN = "expo.modules.splixalarm.OPEN"
    const val EXTRA_ALARM = "alarm"

    // How long it rings with no answer before it becomes a missed reminder.
    const val RING_MS = 60_000L
    const val SNOOZE_MS = 10 * 60_000L
    const val SNOOZE_MINUTES = 10

    private const val IN_CALL_VOLUME = 0.15f
    // Wait, buzz, pause, repeated from the start for as long as it rings.
    private val VIBRATION = longArrayOf(0, 700, 600)

    private val PLACEHOLDER = Alarm(id = "none", fireAt = 0, title = "Reminder")

    // The alarm ringing right now, for the alarm screen and for JavaScript.
    @Volatile
    var current: Alarm? = null
      private set

    /**
     * The alarm screen calls this the moment a button is pressed. The command
     * it sends reaches the service a beat later, and in that gap the app coming
     * back to the front must not find an alarm still "ringing" and reopen the
     * screen that was just answered.
     */
    fun answered() {
      current = null
    }

    fun ringIntent(context: Context, alarm: Alarm): Intent =
      Intent(context, AlarmService::class.java)
        .setAction(ACTION_RING)
        .putExtra(EXTRA_ALARM, alarm.toJson().toString())

    fun actionIntent(context: Context, action: String): Intent =
      Intent(context, AlarmService::class.java).setAction(action)
  }
}
