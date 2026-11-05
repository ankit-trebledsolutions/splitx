/**
 * The ids the server hands out (MongoDB ObjectIds): 24 lowercase hex characters.
 *
 * Ids that reach the app from outside it (an alarm or call handed over by the
 * phone, a push, a tapped notification) become a screen's params and from
 * there part of an API path, so they are checked against this first. The
 * phone's side checks the same (modules/splix-alarm ServerId.kt).
 */
const SERVER_ID = /^[a-f0-9]{24}$/;

export const isServerId = (value) => typeof value === 'string' && SERVER_ID.test(value);

// The id when it is one, else null. Numbers and objects are never ids here.
export const serverIdOrNull = (value) => (isServerId(value) ? value : null);
