const env = require('../config/env');
const emailTemplates = require('./emailTemplate.service');

/**
 * Sends Splix's emails through Resend (https://resend.com), over its plain
 * HTTP API so there is no SDK to keep up to date.
 *
 * With no RESEND_API_KEY the email is printed to the server console instead,
 * which keeps sign-up and password reset usable on a development machine.
 *
 * What an email says comes from emailTemplate.service.js: the version an admin
 * edited in the panel if there is one, the built-in design otherwise.
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
const send = async (to, key, vars) => {
  const mail = await emailTemplates.renderForSend(key, vars);
  return deliver({ to, ...mail });
};

/**
 * For courtesy emails (welcome, "password changed"): a mail hiccup must never
 * fail the sign-up or reset that triggered it. These are also the ones an
 * admin can switch off, which arrives here as no email at all.
 */
const sendQuietly = (to, key, vars) => {
  emailTemplates
    .renderForSend(key, vars)
    .then((mail) => (mail ? deliver({ to, ...mail }) : null))
    .catch((err) => console.error(`[email] could not send "${key}":`, err.message));
};

module.exports = {
  isConfigured,
  sendVerificationCode: (user, code, minutes) =>
    send(user.email, 'verify_email', { name: user.name, code, minutes }),
  sendPasswordResetCode: (user, code, minutes) =>
    send(user.email, 'reset_password', { name: user.name, code, minutes }),
  sendWelcome: (user) => sendQuietly(user.email, 'welcome', { name: user.name }),
  sendPasswordChanged: (user) => sendQuietly(user.email, 'password_changed', { name: user.name }),
  // From the panel's "Send test email". Marked in the subject so it is never
  // mistaken for the real thing — the code in it is a sample and opens nothing.
  sendTest: (to, mail) => deliver({ to, ...mail, subject: `[Test] ${mail.subject}` }),
};
