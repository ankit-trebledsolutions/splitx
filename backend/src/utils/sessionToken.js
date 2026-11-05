/**
 * The rules a verified JWT must also pass before it opens a session.
 *
 * Every token this server signs uses the same secret, so a valid signature
 * only says the token is ours, not what it is for. Three kinds exist:
 *   { sub }                         an app session (auth.service signToken)
 *   { sub, scope: 'admin' }         an admin panel session (admin.service)
 *   { sub, purpose: 'password-reset' }  15 minutes to set a new password
 * The app's API and its socket accept only the first. The admin API checks
 * its own scope in middleware/adminAuth.js.
 */
const isAppSession = (payload) =>
  Boolean(payload) && payload.purpose === undefined && payload.scope === undefined;

/**
 * True when the token was signed before the account's sessions were reset
 * (a password change or removal; see models/User.js). Compared in whole
 * seconds, the precision of `iat`, so a token issued in the same second as
 * the reset (the new sign-in right after it) still works.
 */
const issuedBeforeReset = (payload, user) => {
  const resetAt = user?.sessionsResetAt ? new Date(user.sessionsResetAt).getTime() : 0;
  if (!resetAt) return false;
  return (Number(payload?.iat) || 0) < Math.floor(resetAt / 1000);
};

module.exports = { isAppSession, issuedBeforeReset };
