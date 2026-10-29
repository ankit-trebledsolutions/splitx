require('../testkit/safeEnv');

/**
 * Turning a template into an email, and deciding whether an edited template is
 * fit to be stored.
 *
 * The rules that matter most are the ones nobody would notice breaking until
 * real people were affected: a code email saved without its code, and a name
 * that is read as markup. Nothing here touches a database or sends anything.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFINITIONS, DEFAULTS, blocksFor } = require('../src/emails/defaults');
const { render, findProblems, decodePlaceholders, placeholdersIn } = require('../src/emails/render');
const templates = require('../src/emails/templates');

const PERSON = { name: 'Alex Kumar', code: '482913', minutes: 10 };

test('every built-in design passes the rules an edited one is held to', () => {
  // "Reset to default" and the first save of an untouched template both hand
  // these to the same checks, so a default that fails them could never be saved.
  for (const definition of DEFINITIONS) {
    assert.deepEqual(findProblems(definition, definition.content), [], definition.key);
  }
});

test('the emails that carry a code are the ones that cannot be switched off', () => {
  for (const definition of DEFINITIONS) {
    const carriesCode = definition.variables.some((variable) => variable.key === 'code' && variable.required);
    assert.equal(definition.required, carriesCode, definition.key);
  }
});

test('a built-in email is filled in everywhere, with nothing left in braces', () => {
  for (const key of ['verifyEmail', 'resetPassword', 'welcome', 'passwordChanged']) {
    const mail = templates[key](PERSON);
    for (const part of ['subject', 'html', 'text']) {
      assert.deepEqual(placeholdersIn(mail[part]), [], `${key} ${part}`);
    }
  }

  const mail = templates.verifyEmail(PERSON);
  assert.equal(mail.subject, '482913 is your Splix verification code');
  assert.match(mail.html, /Hi Alex, welcome to Splix!/);
  assert.match(mail.html, />482913<\/div>/);
  assert.match(mail.text, /Your verification code is: 482913/);
  assert.match(mail.text, /expires in 10 minutes/);
});

test('a name is text in the HTML part, never markup', () => {
  const mail = templates.welcome({ name: '<img src=x onerror=alert(1)> Smith' });
  assert.ok(!mail.html.includes('<img src=x'));
  assert.match(mail.html, /&lt;img/);
  // The plain-text part has no markup to protect, so the name is left as typed.
  assert.match(mail.text, /You're in, <img!/);
});

test('a value is never itself read as a template', () => {
  // Somebody naming themselves after a placeholder must not be handed a code.
  const mail = templates.verifyEmail({ ...PERSON, name: '{{code}}' });
  assert.match(mail.text, /^Hi \{\{code\}\}, welcome/);
  assert.match(mail.html, /Hi \{\{code\}\}, welcome/);
});

test('someone with no name is greeted anyway', () => {
  for (const name of [undefined, '', '   ']) {
    assert.match(templates.passwordChanged({ name }).text, /^Hi there,/);
  }
});

test('placeholders are recognised however they are typed', () => {
  const content = { ...DEFAULTS.verify_email.content, body: '<p>{{ Code }} for {{FIRST_NAME}}</p>' };
  assert.deepEqual(placeholdersIn(content.body).sort(), ['code', 'first_name']);
  assert.match(render(content, PERSON).html, /<p>482913 for Alex<\/p>/);
});

test('a subject is always one line', () => {
  const content = { ...DEFAULTS.welcome.content, subject: 'Welcome {{name}}' };
  assert.equal(render(content, { name: 'Alex\r\nBcc: someone@example.com' }).subject,
    'Welcome Alex Bcc: someone@example.com');
});

test('a code email cannot be saved without its code', () => {
  const definition = DEFAULTS.reset_password;

  const noCodeInDesign = { ...definition.content, body: '<p>Hi {{first_name}}, check the app.</p>' };
  assert.match(findProblems(definition, noCodeInDesign).join(' '), /design must contain \{\{code\}\}/);

  // Half of inboxes show the text part first; the code has to be in both.
  const noCodeInText = { ...definition.content, text: 'Hi {{first_name}}, check the app.' };
  assert.match(findProblems(definition, noCodeInText).join(' '), /plain-text version must contain \{\{code\}\}/);
});

test('a placeholder the email cannot fill is refused, and the message says what can be used', () => {
  // The welcome email is sent with no code, so {{code}} there would go out as braces.
  const content = { ...DEFAULTS.welcome.content, subject: 'Your code is {{code}}' };
  const problems = findProblems(DEFAULTS.welcome, content).join(' ');
  assert.match(problems, /\{\{code\}\} in the subject/);
  assert.match(problems, /\{\{first_name\}\}/);

  const typo = { ...DEFAULTS.welcome.content, body: '<p>Hi {{first_nme}}</p>' };
  assert.match(findProblems(DEFAULTS.welcome, typo).join(' '), /\{\{first_nme\}\} in the design/);
});

test('empty parts are refused, including a design that is only empty tags', () => {
  const definition = DEFAULTS.welcome;
  assert.match(findProblems(definition, { ...definition.content, subject: '  ' }).join(' '), /subject cannot be empty/);
  assert.match(findProblems(definition, { ...definition.content, text: '' }).join(' '), /plain-text version cannot be empty/);
  assert.match(
    findProblems(definition, { ...definition.content, body: '<p>&nbsp;</p>\n<p> </p>' }).join(' '),
    /design cannot be empty/
  );
});

test('markup no inbox would accept is refused', () => {
  const definition = DEFAULTS.welcome;
  const refused = [
    '<p>Hi</p><script>alert(1)</script>',
    '<p onclick="alert(1)">Hi</p>',
    '<a href="javascript:alert(1)">Hi</a>',
    '<iframe src="https://example.com"></iframe>',
    '<img src="data:image/png;base64,AAAA">',
  ];
  for (const body of refused) {
    assert.notDeepEqual(findProblems(definition, { ...definition.content, body }), [], body);
  }

  // Ordinary writing that merely resembles the above is left alone.
  const allowed = '<p>Turn notifications on = never miss a payment. <a href="https://splix.app">Open</a></p>';
  assert.deepEqual(findProblems(definition, { ...definition.content, body: allowed }), []);
});

test('a placeholder the editor percent-escaped inside a link is put back', () => {
  assert.equal(decodePlaceholders('<a href="%7B%7Bapp_url%7D%7D">Open</a>'), '<a href="{{app_url}}">Open</a>');
  assert.equal(decodePlaceholders('<p>100%7B</p>'), '<p>100%7B</p>');
});

test('an edited design inherits the look of the card; a built-in one is sent untouched', () => {
  const content = { ...DEFAULTS.welcome.content, body: '<p>Plain paragraph</p>' };
  const edited = render(content, PERSON, { edited: true }).html;
  assert.match(edited, /<div style="font-family:[^"]*color:#F4F7FA;"><p>Plain paragraph<\/p><\/div>/);

  const builtIn = render(content, PERSON).html;
  assert.ok(builtIn.includes('<td style="padding:32px 28px 24px;"><p>Plain paragraph</p></td>'));
});

test('the code box is only offered to the emails that have a code', () => {
  const offers = (key) => blocksFor(DEFAULTS[key]).map((block) => block.key);
  assert.ok(offers('verify_email').includes('code'));
  assert.ok(!offers('welcome').includes('code'));
  // Every block must itself be storable in the email it is offered to.
  for (const definition of DEFINITIONS) {
    for (const block of blocksFor(definition)) {
      const unknown = placeholdersIn(block.html).filter(
        (key) => !definition.variables.some((variable) => variable.key === key)
      );
      assert.deepEqual(unknown, [], `${definition.key} ${block.key}`);
    }
  }
});
