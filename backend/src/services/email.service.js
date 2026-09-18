const env = require('../config/env');
const templates = require('../emails/templates');

/**
 * Sends Splix's emails through Resend (https://resend.com), over its plain
 * HTTP API so there is no SDK to keep up to date.
 *
 * With no RESEND_API_KEY the email is printed to the server console instead,
 * which keeps sign-up and password reset usable on a development machine.
 */
const RESEND_URL = 'https://api.resend.com/emails';

const isConfigured = Boolean(env.email.resendApiKey);

const deliver = async ({ to, subject, html, text }) => {
  if (!isConfigured) {
    console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n${text}\n`);
    return { delivered: false };
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.email.from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { delivered: true };
};

/**
 * For emails the person is waiting on (codes): the caller needs to know if it
 * failed, so this throws.
 */
const send = (to, template) => deliver({ to, ...template });

/**
 * For courtesy emails (welcome, "password changed"): a mail hiccup must never
 * fail the sign-up or reset that triggered it.
 */
const sendQuietly = (to, template) => {
  deliver({ to, ...template }).catch((err) =>
    console.error(`[email] could not send "${template.subject}":`, err.message)
  );
};

module.exports = {
  isConfigured,
  sendVerificationCode: (user, code, minutes) =>
    send(user.email, templates.verifyEmail({ name: user.name, code, minutes })),
  sendPasswordResetCode: (user, code, minutes) =>
    send(user.email, templates.resetPassword({ name: user.name, code, minutes })),
  sendWelcome: (user) => sendQuietly(user.email, templates.welcome({ name: user.name })),
  sendPasswordChanged: (user) =>
    sendQuietly(user.email, templates.passwordChanged({ name: user.name })),
};
