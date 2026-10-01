import SplixAlarm from '../../modules/splix-alarm';

/**
 * Group calls that ring like a phone call.
 *
 * The ringing needs no JavaScript: the server's push is taken by native code
 * (modules/splix-alarm: SplixMessagingService, CallCenter), which rings and
 * shows the call screen even with the app closed. This file is what the app
 * itself still has to do:
 *
 *  - pass on a ring that arrives over the socket, which is quicker than the
 *    push while the app is open (the same ring arriving both ways rings once);
 *  - join the call once the person has pressed Accept;
 *  - say which call the person is in, so that one does not ring.
 *
 * iOS, and an Android build from before calls rang, have none of this: there
 * the server's push is shown as the ordinary notification it looks like.
 */

// True when this build can ring for a call. The module itself is older than
// calls, so its presence is not enough.
export const callsSupported = typeof SplixAlarm?.showIncomingCall === 'function';

// Someone is signed in: their groups' calls may ring on this phone. (Signing
// out stops that; see clearReminderAlarms.)
export const allowIncomingCalls = () => {
  if (callsSupported) SplixAlarm.setSignedIn();
};

// `data` is what the server sends with 'call:ring' (backend callRing.service).
export const showIncomingCall = (data) => {
  if (callsSupported && data?.groupId) SplixAlarm.showIncomingCall(data).catch(() => {});
};

// `data` is what the server sends with 'call:end'.
export const endIncomingCall = (data) => {
  if (callsSupported && data?.groupId) {
    SplixAlarm.endIncomingCall(String(data.groupId), Number(data.at) || 0).catch(() => {});
  }
};

// The call the person accepted, until the app has joined it. Kept here rather
// than in a component: the screens are mounted afresh when the connection to
// the call service comes up (StreamVideoProvider), and an answer held in
// their state would be lost with them.
let accepted = null;

/**
 * The call the person accepted and the app has still to join, as
 * { call: { groupId, groupName, video, ... }, since }, or null. The phone
 * hands an answer over once, and only shortly after Accept was pressed.
 */
export const acceptedCall = () => {
  if (!accepted && callsSupported) {
    const call = SplixAlarm.takeAnsweredCall();
    if (call) accepted = { call, since: Date.now() };
  }
  return accepted;
};

// Joined, given up on, or the person signed out.
export const forgetAcceptedCall = () => {
  accepted = null;
};

// Where a tap on a "missed call" notification leads, as [screen, params]. Once.
export const takeCallRoute = () => {
  const call = callsSupported ? SplixAlarm.takeCallOpen() : null;
  return call ? ['GroupChat', { groupId: call.groupId }] : null;
};

/**
 * The app was opened while a call is ringing: put the call screen in front, so
 * there is always somewhere to answer it from.
 */
export const showRingingCall = () => {
  if (callsSupported && SplixAlarm.getIncomingCall()) SplixAlarm.showRingingCall().catch(() => {});
};

// Which group's call the person is in (null for none).
export const setActiveCall = (groupId) => {
  if (callsSupported) SplixAlarm.setActiveCall(groupId ?? null);
};

// type: 'ringing' | 'stopped' | 'open'. Returns the subscription (or a no-op one).
export const addCallListener = (listener) =>
  callsSupported ? SplixAlarm.addListener('onCallEvent', listener) : { remove: () => {} };
