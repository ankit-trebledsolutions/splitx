package expo.modules.splixalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android drops every scheduled alarm when the phone restarts, and makes them
 * inexact (or exact again) when the user changes "Alarms & reminders". Either
 * way the stored alarms are set afresh.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmScheduler.restoreAll(context.applicationContext)
  }
}
