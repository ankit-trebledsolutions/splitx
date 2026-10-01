package expo.modules.splixalarm

import android.content.Context
import android.media.RingtoneManager
import android.net.Uri
import android.provider.Settings

/**
 * Where an alarm's sound comes from.
 *
 * Every alarm carries a sound name. A name is a file in this module's
 * res/raw folder, without its extension: "splix_alarm" is res/raw/splix_alarm.ogg.
 * To change the tone, replace that file. To offer several (a sound per group,
 * say), add more files there and pass their names from JavaScript; nothing in
 * here needs to change.
 */
object AlarmSound {
  const val DEFAULT = "splix_alarm"

  private val SAFE_NAME = Regex("[a-z][a-z0-9_]*")

  fun uriFor(context: Context, name: String?): Uri {
    val resources = context.resources
    val asked = name?.takeIf { SAFE_NAME.matches(it) }
      ?.let { resources.getIdentifier(it, "raw", context.packageName) } ?: 0
    // An unknown name (a sound removed in a later version) falls back to ours.
    val id = if (asked != 0) asked else R.raw.splix_alarm
    return Uri.parse("android.resource://${context.packageName}/$id")
  }

  // If our own file cannot be played, the phone's alarm tone still can.
  fun systemDefault(): Uri =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: Settings.System.DEFAULT_ALARM_ALERT_URI
}
