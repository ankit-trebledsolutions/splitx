package expo.modules.splixalarm

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
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
import android.provider.Settings
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Rings an incoming group call: the phone's own ringtone and vibration, and
 * the notification that carries the call screen. A foreground service, so
 * Android keeps it alive with the app closed.
 *
 * It only makes the noise. What rings and when it stops is CallCenter's
 * business: this rings whatever CallCenter says is ringing, until told to stop
 * or until RING_MS has passed with no answer.
 *
 * It rings the way a phone call does, not the way an alarm does: on the ring
 * volume, silent when the phone is on silent or Do Not Disturb, vibrating only
 * when the phone would vibrate for a call.
 */
class CallService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val giveUp = Runnable { ringing?.let { CallCenter.timeout(this, it) } }

  private var ringing: IncomingCall? = null
  private var player: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val call = CallCenter.ringing(this)
    val onScreen = intent?.getBooleanExtra(EXTRA_ON_SCREEN, false) ?: false

    // Always, and first: a service started this way must become a foreground
    // one, even when the call was answered before it got going.
    val notification = CallNotifications.ringing(this, call ?: PLACEHOLDER, fullScreen = !onScreen)
    if (!enterForeground(notification)) {
      CallCenter.serviceRefused(this)
      stopSelf()
      return START_NOT_STICKY
    }

    if (call == null) {
      shutDown()
    } else if (ringing?.sameRingAs(call) != true) {
      ringing = call
      holdWakeLock()
      startAlerting()
      handler.removeCallbacks(giveUp)
      handler.postDelayed(giveUp, CallCenter.RING_MS)
    }
    // If the process is killed mid-ring, do not come back with a stale call.
    return START_NOT_STICKY
  }

  private fun shutDown() {
    handler.removeCallbacks(giveUp)
    stopAlerting()
    ringing = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  /** "shortService" is the type for a brief, urgent job; a ring is well inside its three minutes. */
  private fun enterForeground(notification: Notification): Boolean = try {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
    } else {
      0
    }
    ServiceCompat.startForeground(this, CallNotifications.RINGING_ID, notification, type)
    true
  } catch (_: Exception) {
    false
  }

  // A "shortService" that outstays its welcome is stopped by Android this way.
  override fun onTimeout(startId: Int) {
    val call = ringing
    if (call != null) CallCenter.timeout(this, call) else shutDown()
  }

  override fun onDestroy() {
    handler.removeCallbacks(giveUp)
    stopAlerting()
    if (instance === this) instance = null
    super.onDestroy()
  }

  // ---- Sound and vibration -------------------------------------------------

  // On the ring volume, like a phone call: nothing is heard with the phone on
  // silent or vibrate.
  private val ringAudio: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private fun startAlerting() {
    val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    // Do Not Disturb hides the call; ringing for something not shown helps nobody.
    if (isDoNotDisturbOn()) return
    when (audio.ringerMode) {
      AudioManager.RINGER_MODE_NORMAL -> {
        requestAudioFocus(audio)
        play(ringtones())
        startVibration()
      }
      AudioManager.RINGER_MODE_VIBRATE -> startVibration()
    }
  }

  private fun isDoNotDisturbOn(): Boolean {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL
  }

  /**
   * What to ring with, in order of preference: the phone's own ringtone, its
   * notification tone, and last the tone that ships with the app. The first
   * two belong to the phone, and a ringtone kept on a memory card, or none
   * being set, leaves them unplayable.
   */
  private fun ringtones(): List<Uri> = listOfNotNull(
    Settings.System.DEFAULT_RINGTONE_URI,
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
    AlarmSound.uriFor(this, AlarmSound.DEFAULT)
  )

  // Plays the first of [candidates] that can be played.
  private fun play(candidates: List<Uri>) {
    val uri = candidates.firstOrNull() ?: return
    val rest = candidates.drop(1)
    val next = MediaPlayer()
    player = next
    try {
      next.setAudioAttributes(ringAudio)
      next.setDataSource(this, uri)
      next.isLooping = true
      next.setOnPreparedListener { ready ->
        // Stopped while it was still loading.
        if (player === ready) ready.start()
      }
      next.setOnErrorListener { failed, _, _ ->
        if (player === failed) {
          releasePlayer()
          play(rest)
        }
        true
      }
      next.prepareAsync()
    } catch (_: Exception) {
      releasePlayer()
      play(rest)
    }
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

  private fun requestAudioFocus(audio: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(ringAudio)
        .build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(null, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
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
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_RINGTONE)
        )
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), ringAudio)
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(VIBRATION, 0)
      }
    } catch (_: Exception) {
      // No vibration is not worth losing the ring over.
    }
  }

  // ---- Staying awake -------------------------------------------------------

  private fun holdWakeLock() {
    releaseWakeLock()
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "splix:call-ringing").apply {
      setReferenceCounted(false)
      // Released when the ring ends; the limit is only a safety net.
      acquire(CallCenter.RING_MS + 10_000L)
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
    private const val EXTRA_ON_SCREEN = "onScreen"

    // Buzz for a second, pause for a second, for as long as it rings.
    private val VIBRATION = longArrayOf(0, 1000, 1000)

    private val PLACEHOLDER = IncomingCall(groupId = "none", groupName = "Splix", callerName = "", at = 1)

    // The running service, for CallCenter to stop: both live in one process.
    @Volatile
    private var instance: CallService? = null

    /**
     * Asks Android to start ringing. False when it refuses, which it does for
     * an app in the background unless something urgent (a high-priority push)
     * has just arrived for it.
     */
    fun start(context: Context, appOnScreen: Boolean): Boolean = try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, CallService::class.java).putExtra(EXTRA_ON_SCREEN, appOnScreen)
      )
      true
    } catch (_: Exception) {
      false
    }

    /**
     * Stops the ringing. If the service has been asked for but is not running
     * yet, it finds nothing left to ring when it starts and stops by itself.
     */
    fun stop() {
      instance?.shutDown()
    }
  }
}
