import { requireOptionalNativeModule } from 'expo';

/**
 * The native alarm clock (Android only): android/src/main/java/expo/modules/splixalarm.
 *
 * Null on iOS, and on an Android build made before this module existed. Callers
 * check for that and fall back to ordinary scheduled notifications; see
 * src/utils/reminderAlarms.js, which is the only place the app talks to this.
 *
 *   getPermissions()      { notifications, exactAlarm, exactAlarmIsSetting, fullScreen, fullScreenIsSetting }
 *   openSettings(kind)    'exactAlarm' | 'fullScreen' | 'notifications' | 'app'
 *   sync(alarms)          hold exactly these alarms; resolves to the ids now waiting
 *   upsert(alarm)         set or move one
 *   remove(id)            drop one
 *   clear()               drop everything (sign-out)
 *   getScheduled()        what is waiting to ring
 *   getRinging()          the alarm ringing now, or null
 *   stopRinging()
 *   showRinging()         put the alarm screen in front, if one is ringing
 *   takeOpen()            where an alarm asked the app to go, once
 *   addListener('onAlarmEvent', ({ type, reason, alarm }) => {})
 *                         type: 'fired' | 'stopped' | 'open'
 *
 * An alarm is { id, fireAt, title, body, groupId, groupName, taskId, sound,
 * repeatMs, repeatUntil }, with times in epoch milliseconds. `sound` names a
 * file in android/src/main/res/raw (see AlarmSound.kt).
 */
export default requireOptionalNativeModule('SplixAlarm');
