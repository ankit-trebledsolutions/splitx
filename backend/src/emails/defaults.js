const {
  heading,
  paragraph,
  button,
  codeBox,
  note,
  featureRow,
  theme,
  FONT,
  APP_URL,
  SUPPORT_EMAIL,
} = require('./layout');

/**
 * The built-in design of every email Splix sends, and the list of emails that
 * exist at all.
 *
 * These are what goes out until an admin edits a template in the panel (Manage
 * CMS > Email Templates), and what "Reset to default" returns to. They are
 * written with {{placeholders}} rather than values so the panel can show and
 * edit them exactly as they are sent.
 *
 * An email is listed here because some code sends it. Adding an entry makes it
 * appear in the panel, but nothing goes out until services/email.service.js
 * has a function that sends it.
 */

const spacer = (px) => `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`;

// What a template may refer to. `sample` is what the panel's preview shows in
// its place; `required` means the email is useless without it.
const PERSON = [
  { key: 'first_name', label: 'First name', sample: 'Alex' },
  { key: 'name', label: 'Full name', sample: 'Alex Kumar' },
];
const LINKS = [
  { key: 'app_url', label: 'Link to the app', sample: APP_URL },
  { key: 'support_email', label: 'Support email address', sample: SUPPORT_EMAIL },
];
const CODE = [
  { key: 'code', label: 'One-time code', sample: '482913', required: true },
  { key: 'minutes', label: 'Minutes until the code expires', sample: '10' },
];

const CODE_EXPIRY = paragraph(
  'This code expires in <strong>{{minutes}} minutes</strong> and can only be used once.',
  { muted: true, small: true }
);

const DEFINITIONS = [
  {
    key: 'verify_email',
    name: 'Email verification code',
    description: 'Sent when someone signs up, with the code that confirms their email address.',
    // Switching this off would leave nobody able to finish signing up.
    required: true,
    variables: [...PERSON, ...CODE, ...LINKS],
    content: {
      subject: '{{code}} is your Splix verification code',
      preheader: 'Your code is {{code}}. It expires in {{minutes}} minutes.',
      reason: 'You are receiving this because someone signed up for Splix with this email address.',
      body: [
        heading('Verify your email'),
        paragraph(
          "Hi {{first_name}}, welcome to Splix! Enter this code in the app to confirm it's really you and finish setting up your account."
        ),
        codeBox('{{code}}'),
        CODE_EXPIRY,
        note("Didn't sign up for Splix? You can safely ignore this email. No account is active until the code is entered."),
      ].join(''),
      text: [
        'Hi {{first_name}}, welcome to Splix!',
        '',
        'Your verification code is: {{code}}',
        'It expires in {{minutes}} minutes and can only be used once.',
        '',
        "Didn't sign up for Splix? You can safely ignore this email.",
      ].join('\n'),
    },
  },
  {
    key: 'reset_password',
    name: 'Password reset code',
    description: 'Sent when someone taps Forgot Password, with the code that lets them choose a new one.',
    required: true,
    variables: [...PERSON, ...CODE, ...LINKS],
    content: {
      subject: '{{code}} is your Splix password reset code',
      preheader: 'Your reset code is {{code}}. It expires in {{minutes}} minutes.',
      reason: 'You are receiving this because a password reset was requested for your Splix account.',
      body: [
        heading('Reset your password'),
        paragraph(
          'Hi {{first_name}}, we got a request to reset your Splix password. Enter this code in the app to choose a new one.'
        ),
        codeBox('{{code}}'),
        CODE_EXPIRY,
        note(
          "Didn't ask for this? Your password has not been changed and you can ignore this email. Never share this code with anyone. Splix will never ask you for it.",
          { tone: 'danger' }
        ),
      ].join(''),
      text: [
        'Hi {{first_name}},',
        '',
        'Your Splix password reset code is: {{code}}',
        'It expires in {{minutes}} minutes and can only be used once.',
        '',
        "Didn't ask for this? Your password has not been changed and you can ignore this email.",
        'Never share this code with anyone.',
      ].join('\n'),
    },
  },
  {
    key: 'welcome',
    name: 'Welcome',
    description: 'Sent once, right after someone verifies their email and their account becomes active.',
    required: false,
    variables: [...PERSON, ...LINKS],
    content: {
      subject: 'Welcome to Splix 🎉',
      preheader: "Your account is ready. Here's how to get the most out of Splix.",
      reason: 'You are receiving this because you just created a Splix account.',
      body: [
        heading("You're in, {{first_name}}! 🎉"),
        paragraph(
          'Your email is verified and your Splix account is ready. No more awkward "who owes what" chats. Here is what you can do now:'
        ),
        spacer(8),
        featureRow('💸', 'Split expenses fairly', 'Add a bill, pick who was in, and Splix works out who owes whom.'),
        featureRow('✈️', 'Plan trips together', 'Itinerary, stays, tasks and reminders for the whole group in one place.'),
        featureRow('💬', 'Stay in sync', 'Group chat, calls and a shared photo gallery, so nothing gets lost.'),
        spacer(12),
        button('Open Splix', APP_URL),
        paragraph(
          'Tip: start by creating a group and inviting your friends. Everything else builds from there.',
          { muted: true, small: true }
        ),
      ].join(''),
      text: [
        "You're in, {{first_name}}!",
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
    },
  },
  {
    key: 'password_changed',
    name: 'Password changed',
    description: 'Sent after a password is changed, so the owner hears about it if it was not them.',
    required: false,
    variables: [...PERSON, ...LINKS],
    content: {
      subject: 'Your Splix password was changed',
      preheader: 'This is a confirmation that your Splix password was just changed.',
      reason: 'You are receiving this because the password on your Splix account was changed.',
      body: [
        heading('Password changed'),
        paragraph(
          'Hi {{first_name}}, this confirms that the password for your Splix account was just changed. You can now log in with your new password.'
        ),
        note(
          "Wasn't you? Reset your password straight away from the login screen (Forgot Password), then reply to this email so we can help secure your account.",
          { tone: 'danger' }
        ),
      ].join(''),
      text: [
        'Hi {{first_name}},',
        '',
        'This confirms that the password for your Splix account was just changed.',
        '',
        "Wasn't you? Reset your password straight away from the login screen (Forgot Password), then contact support.",
      ].join('\n'),
    },
  },
];

// No prototype underneath: looked up with a name that arrives in a request,
// and '__proto__' or 'constructor' must find nothing rather than something.
const DEFAULTS = Object.assign(
  Object.create(null),
  Object.fromEntries(DEFINITIONS.map((definition) => [definition.key, definition]))
);
const TEMPLATE_KEYS = DEFINITIONS.map((definition) => definition.key);

// What the preview and the test email are filled with.
const SAMPLE = { name: 'Alex Kumar', code: '482913', minutes: 10 };

/**
 * Ready-made pieces the panel's editor can drop into a design. They are built
 * by the same helpers as the emails above, so something inserted in the editor
 * matches the rest of the email without anyone copying styles by hand.
 */
const blocksFor = (definition) => {
  const hasCode = definition.variables.some((variable) => variable.key === 'code');
  return [
    { key: 'heading', label: 'Heading', html: heading('Your heading') },
    { key: 'paragraph', label: 'Paragraph', html: paragraph('Write your text here.') },
    {
      key: 'small',
      label: 'Small grey text',
      html: paragraph('A quieter line, for details.', { muted: true, small: true }),
    },
    { key: 'button', label: 'Button', html: button('Open Splix', APP_URL) },
    ...(hasCode ? [{ key: 'code', label: 'Code box', html: codeBox('{{code}}') }] : []),
    { key: 'note', label: 'Note', html: note('Something worth pointing out.') },
    {
      key: 'warning',
      label: 'Warning note',
      html: note('Something the reader should be careful about.', { tone: 'danger' }),
    },
    { key: 'feature', label: 'Icon row', html: featureRow('✨', 'A short title', 'One line that explains it.') },
    { key: 'spacer', label: 'Space', html: spacer(12) },
  ];
};

// The look of the card the design sits in, so the editor can show text on the
// same background it will be read on.
const CANVAS = {
  background: theme.card,
  page: theme.page,
  text: theme.text,
  muted: theme.muted,
  accent: theme.accent,
  border: theme.border,
  font: FONT,
  width: 520,
  // Offered first in the editor's colour picker, so a design stays on brand
  // without anyone copying hex codes about.
  palette: [
    { name: 'Text', color: theme.text },
    { name: 'Grey text', color: theme.muted },
    { name: 'Accent', color: theme.accent },
    { name: 'Blue', color: '#4A8CFF' },
    { name: 'Green', color: '#00E5A0' },
    { name: 'Warning', color: theme.danger },
    { name: 'Raised background', color: theme.raised },
    { name: 'Dark text on accent', color: theme.onAccent },
  ],
};

module.exports = { DEFINITIONS, DEFAULTS, TEMPLATE_KEYS, SAMPLE, CANVAS, blocksFor };
