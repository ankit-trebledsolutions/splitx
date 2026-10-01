import { requireOptionalNativeModule } from 'expo';

/**
 * What rings on this phone (Android only): android/src/main/java/expo/modules/splixalarm.
 *
 * Null on iOS, and on an Android build made before this module existed. Callers
 * check for that and fall back to ordinary notifications. The app talks to it
 * from two places only: src/utils/reminderAlarms.js and src/utils/incomingCalls.js.
 *
 * Reminder alarms
 *
 *   getPermissions()      { notifications, exactAlarm, exactAlarmIsSetting, fullScreen, fullScreenIsSetting }
 *   openSettings(kind)    'exactAlarm' | 'fullScreen' | 'notifications' | 'app'
 *   sync(alarms)          hold exactly these alarms; resolves to the ids now waiting
 *   upsert(alarm)         set or move one
 *   remove(id)            drop one
 *   clear()               drop everything, and stop ringing for calls (sign-out)
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
 *
 * Incoming group calls (missing on a build from before calls rang: check for
 * the function). The ringing itself needs no JavaScript; it starts from the
 * server's push.
 *
 *   setSignedIn()             calls may ring for the person signed in
 *   showIncomingCall(call)    a ring that arrived over the socket
 *   endIncomingCall(groupId, at)
 *   getIncomingCall()         the call ringing now, or null
 *   showRingingCall()         put the call screen in front, if one is ringing
 *   takeAnsweredCall()        the call the person accepted, to join; once
 *   takeCallOpen()            the missed call that was tapped, to open its group; once
 *   setActiveCall(groupId)    which call the person is in (null for none)
 *   addListener('onCallEvent', ({ type, reason, call }) => {})
 *                             type: 'ringing' | 'stopped' | 'open'
 *
 * A call is { groupId, groupName, callerId, callerName, video, at }: `video`
 * is null when the caller's app did not say, `at` is when the server sent the
 * ring, in epoch milliseconds.
 */
export default requireOptionalNativeModule('SplixAlarm');
