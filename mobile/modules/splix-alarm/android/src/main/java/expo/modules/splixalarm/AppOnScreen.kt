package expo.modules.splixalarm

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager

/**
 * Whether the app itself is what the person is looking at: the screen is on,
 * the phone is unlocked and one of the app's own screens is in front. Then an
 * alarm or a call can simply be opened on top of it. Otherwise Android has to
 * be asked to show it, through a notification's full-screen intent.
 */
internal fun isAppOnScreen(context: Context): Boolean {
  val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
  if (!power.isInteractive || keyguard.isKeyguardLocked) return false
  val state = ActivityManager.RunningAppProcessInfo()
  ActivityManager.getMyMemoryState(state)
  return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
}
