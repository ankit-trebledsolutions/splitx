/**
 * Renders every Splix email to an HTML file so the design can be checked in a
 * browser without sending anything:
 *
 *   node scripts/preview-emails.js
 *
 * Then open the files it lists. Nothing here touches the database or Resend.
 */
const fs = require('fs');
const path = require('path');
const templates = require('../src/emails/templates');

const OUT = path.join(__dirname, '..', 'email-previews');
fs.mkdirSync(OUT, { recursive: true });

const samples = {
  'verify-email': templates.verifyEmail({ name: 'Alex Kumar', code: '482913', minutes: 10 }),
  'reset-password': templates.resetPassword({ name: 'Alex Kumar', code: '730158', minutes: 10 }),
  welcome: templates.welcome({ name: 'Alex Kumar' }),
  'password-changed': templates.passwordChanged({ name: 'Alex Kumar' }),
};

for (const [name, mail] of Object.entries(samples)) {
  const file = path.join(OUT, `${name}.html`);
  fs.writeFileSync(file, mail.html);
  console.log(`${mail.subject}\n  ${file}\n`);
}
