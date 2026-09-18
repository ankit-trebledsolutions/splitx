const {
  layout,
  heading,
  paragraph,
  button,
  codeBox,
  note,
  featureRow,
  escapeHtml,
  APP_URL,
} = require('./layout');

/**
 * Every email Splix sends. Each returns { subject, html, text }: the text part
 * is what plain-text clients and spam filters read, so it carries the same
 * information as the HTML, never just "view this in a browser".
 */

const firstName = (name) => escapeHtml((name || 'there').trim().split(/\s+/)[0]);

const verifyEmail = ({ name, code, minutes }) => ({
  subject: `${code} is your Splix verification code`,
  html: layout({
    preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
    reason: 'You are receiving this because someone signed up for Splix with this email address.',
    body: [
      heading('Verify your email'),
      paragraph(
        `Hi ${firstName(name)}, welcome to Splix! Enter this code in the app to confirm it's really you and finish setting up your account.`
      ),
      codeBox(code),
      paragraph(`This code expires in <strong>${minutes} minutes</strong> and can only be used once.`, {
        muted: true,
        small: true,
      }),
      note("Didn't sign up for Splix? You can safely ignore this email. No account is active until the code is entered."),
    ].join(''),
  }),
  text: [
    `Hi ${(name || 'there').split(' ')[0]}, welcome to Splix!`,
    '',
    `Your verification code is: ${code}`,
    `It expires in ${minutes} minutes and can only be used once.`,
    '',
    "Didn't sign up for Splix? You can safely ignore this email.",
  ].join('\n'),
});

const resetPassword = ({ name, code, minutes }) => ({
  subject: `${code} is your Splix password reset code`,
  html: layout({
    preheader: `Your reset code is ${code}. It expires in ${minutes} minutes.`,
    reason: 'You are receiving this because a password reset was requested for your Splix account.',
    body: [
      heading('Reset your password'),
      paragraph(
        `Hi ${firstName(name)}, we got a request to reset your Splix password. Enter this code in the app to choose a new one.`
      ),
      codeBox(code),
      paragraph(`This code expires in <strong>${minutes} minutes</strong> and can only be used once.`, {
        muted: true,
        small: true,
      }),
      note(
        "Didn't ask for this? Your password has not been changed and you can ignore this email. Never share this code with anyone. Splix will never ask you for it.",
        { tone: 'danger' }
      ),
    ].join(''),
  }),
  text: [
    `Hi ${(name || 'there').split(' ')[0]},`,
    '',
    `Your Splix password reset code is: ${code}`,
    `It expires in ${minutes} minutes and can only be used once.`,
    '',
    "Didn't ask for this? Your password has not been changed and you can ignore this email.",
    'Never share this code with anyone.',
  ].join('\n'),
});

const welcome = ({ name }) => ({
  subject: 'Welcome to Splix 🎉',
  html: layout({
    preheader: "Your account is ready. Here's how to get the most out of Splix.",
    reason: 'You are receiving this because you just created a Splix account.',
    body: [
      heading(`You're in, ${firstName(name)}! 🎉`),
      paragraph(
        'Your email is verified and your Splix account is ready. No more awkward "who owes what" chats. Here is what you can do now:'
      ),
      '<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>',
      featureRow('💸', 'Split expenses fairly', 'Add a bill, pick who was in, and Splix works out who owes whom.'),
      featureRow('✈️', 'Plan trips together', 'Itinerary, stays, tasks and reminders for the whole group in one place.'),
      featureRow('💬', 'Stay in sync', 'Group chat, calls and a shared photo gallery, so nothing gets lost.'),
      '<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>',
      button('Open Splix', APP_URL),
      paragraph(
        'Tip: start by creating a group and inviting your friends. Everything else builds from there.',
        { muted: true, small: true }
      ),
    ].join(''),
  }),
  text: [
    `You're in, ${(name || 'there').split(' ')[0]}!`,
    '',
    'Your email is verified and your Splix account is ready. Here is what you can do now:',
    '',
    '- Split expenses fairly: add a bill, pick who was in, and Splix works out who owes whom.',
    '- Plan trips together: itinerary, stays, tasks and reminders for the whole group.',
    '- Stay in sync: group chat, calls and a shared photo gallery.',
    '',
    'Tip: start by creating a group and inviting your friends.',
    APP_URL,
  ].join('\n'),
});

const passwordChanged = ({ name }) => ({
  subject: 'Your Splix password was changed',
  html: layout({
    preheader: 'This is a confirmation that your Splix password was just changed.',
    reason: 'You are receiving this because the password on your Splix account was changed.',
    body: [
      heading('Password changed'),
      paragraph(
        `Hi ${firstName(name)}, this confirms that the password for your Splix account was just changed. You can now log in with your new password.`
      ),
      note(
        "Wasn't you? Reset your password straight away from the login screen (Forgot Password), then reply to this email so we can help secure your account.",
        { tone: 'danger' }
      ),
    ].join(''),
  }),
  text: [
    `Hi ${(name || 'there').split(' ')[0]},`,
    '',
    'This confirms that the password for your Splix account was just changed.',
    '',
    "Wasn't you? Reset your password straight away from the login screen (Forgot Password), then contact support.",
  ].join('\n'),
});

module.exports = { verifyEmail, resetPassword, welcome, passwordChanged };
