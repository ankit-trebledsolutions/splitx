require('../testkit/safeEnv');

/**
 * Which version of an email goes out.
 *
 * An admin can now change what Splix's emails say, so the promise this file
 * keeps is that they cannot break them: whatever is stored, and whatever the
 * database is doing, the person waiting on a code still receives one.
 *
 * No database: the model's queries are mocked.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const EmailTemplate = require('../src/models/EmailTemplate');
const service = require('../src/services/emailTemplate.service');
const { DEFAULTS } = require('../src/emails/defaults');
const templates = require('../src/emails/templates');

const PERSON = { name: 'Alex Kumar', code: '482913', minutes: 10 };
const ACTOR = { name: 'Test Admin', email: 'admin@example.com' };

// Mongoose queries are chained (.lean()), so the stand-in has to be as well.
const query = (result) => ({ lean: async () => (typeof result === 'function' ? result() : result) });

const storing = (t, doc) => t.mock.method(EmailTemplate, 'findOne', () => query(doc));

const edited = (key, overrides = {}) => ({
  key,
  isActive: true,
  customized: true,
  ...DEFAULTS[key].content,
  ...overrides,
});

// Silences the expected "sending the built-in one" lines for the test run.
const quietly = (t) => t.mock.method(console, 'error', () => {});

test('an email nobody has edited goes out in its built-in design', async (t) => {
  storing(t, null);
  assert.deepEqual(await service.renderForSend('verify_email', PERSON), templates.verifyEmail(PERSON));
});

test('an edited email goes out as edited', async (t) => {
  storing(
    t,
    edited('verify_email', {
      subject: 'Your Splix code: {{code}}',
      body: '<p>Hello {{first_name}}, use {{code}}.</p>',
      text: 'Hello {{first_name}}, use {{code}}.',
    })
  );
  const mail = await service.renderForSend('verify_email', PERSON);
  assert.equal(mail.subject, 'Your Splix code: 482913');
  assert.match(mail.html, /<p>Hello Alex, use 482913\.<\/p>/);
  assert.equal(mail.text, 'Hello Alex, use 482913.');
  // Still inside the Splix frame: only the inside of the card is the admin's.
  assert.match(mail.html, /<title>Splix<\/title>/);
});

test('a database failure costs the custom wording, never the email', async (t) => {
  quietly(t);
  t.mock.method(EmailTemplate, 'findOne', () =>
    query(() => {
      throw new Error('connection lost');
    })
  );
  assert.deepEqual(await service.renderForSend('reset_password', PERSON), templates.resetPassword(PERSON));
});

test('a stored template that has lost its code is not sent', async (t) => {
  // Saving refuses this, so it can only come from a document changed by hand.
  quietly(t);
  storing(t, edited('verify_email', { body: '<p>Welcome!</p>' }));
  assert.deepEqual(await service.renderForSend('verify_email', PERSON), templates.verifyEmail(PERSON));
});

test('a half-written document is ignored rather than sent with holes in it', async (t) => {
  storing(t, { key: 'welcome', isActive: true, customized: true, subject: 'Hi' });
  assert.deepEqual(await service.renderForSend('welcome', PERSON), templates.welcome(PERSON));
});

test('a switched-off email is not sent', async (t) => {
  storing(t, { key: 'welcome', isActive: false, customized: false });
  assert.equal(await service.renderForSend('welcome', PERSON), null);
});

test('a code email is sent even if its document says it is switched off', async (t) => {
  storing(t, { key: 'verify_email', isActive: false, customized: false });
  assert.deepEqual(await service.renderForSend('verify_email', PERSON), templates.verifyEmail(PERSON));
});

test('switching off a code email is refused before anything is written', async (t) => {
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', () => query(null));
  for (const key of ['verify_email', 'reset_password']) {
    await assert.rejects(service.setActive(key, false, ACTOR), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /cannot be switched off/);
      return true;
    });
  }
  assert.equal(write.mock.callCount(), 0);
});

test('a courtesy email can be switched off, and says who did it', async (t) => {
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', (_filter, change) =>
    query({ key: 'welcome', customized: false, ...change.$set })
  );
  const template = await service.setActive('welcome', false, ACTOR);
  assert.equal(template.isActive, false);
  assert.equal(template.updatedBy, 'Test Admin');
  // The design is untouched by the switch.
  assert.equal(template.isCustomized, false);
  assert.equal(template.body, DEFAULTS.welcome.content.body);
  assert.deepEqual(write.mock.calls[0].arguments[0], { key: 'welcome' });
});

test('an edit that would break the email is refused before anything is written', async (t) => {
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', () => query(null));
  const broken = { ...DEFAULTS.verify_email.content, body: '<p>No code here</p>' };
  await assert.rejects(service.update('verify_email', broken, ACTOR), (err) => {
    assert.equal(err.statusCode, 400);
    assert.match(err.message, /must contain \{\{code\}\}/);
    return true;
  });
  assert.equal(write.mock.callCount(), 0);
});

test('a saved edit is tidied, marked as the admin’s own, and creates the document if needed', async (t) => {
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', (_filter, change) =>
    query({ key: 'welcome', isActive: true, ...change.$set })
  );
  const template = await service.update(
    'welcome',
    {
      subject: '  Welcome\naboard, {{first_name}}  ',
      preheader: 'Glad you are here',
      body: '<p>Hi {{first_name}}</p><a href="%7B%7Bapp_url%7D%7D">Open</a>',
      text: 'Hi {{first_name}}\r\nOpen the app',
      reason: '',
    },
    ACTOR
  );

  const [filter, change, options] = write.mock.calls[0].arguments;
  assert.deepEqual(filter, { key: 'welcome' });
  assert.equal(options.upsert, true);
  assert.equal(change.$set.customized, true);
  assert.equal(change.$set.subject, 'Welcome aboard, {{first_name}}');
  assert.equal(change.$set.body, '<p>Hi {{first_name}}</p><a href="{{app_url}}">Open</a>');
  assert.equal(change.$set.text, 'Hi {{first_name}}\nOpen the app');
  assert.equal(template.isCustomized, true);
  assert.equal(template.updatedBy, 'Test Admin');
});

test('resetting returns the built-in design and leaves the switch alone', async (t) => {
  const write = t.mock.method(EmailTemplate, 'findOneAndUpdate', () =>
    query({ key: 'welcome', isActive: false, customized: false })
  );
  const template = await service.reset('welcome', ACTOR);
  const [, change, options] = write.mock.calls[0].arguments;
  assert.deepEqual(Object.keys(change.$unset).sort(), ['body', 'preheader', 'reason', 'subject', 'text']);
  // Nothing to reset means nothing to create.
  assert.notEqual(options.upsert, true);
  assert.equal(template.isCustomized, false);
  assert.equal(template.isActive, false);
  assert.equal(template.subject, DEFAULTS.welcome.content.subject);
});

test('the list shows all four emails, edited or not, and can be searched', async (t) => {
  t.mock.method(EmailTemplate, 'find', () =>
    query([edited('welcome', { subject: 'A warm hello', updatedBy: 'Test Admin' })])
  );

  const all = await service.list({ page: 1, limit: 20 });
  assert.equal(all.total, 4);
  assert.deepEqual(
    all.templates.map((template) => [template.key, template.isCustomized]),
    [
      ['verify_email', false],
      ['reset_password', false],
      ['welcome', true],
      ['password_changed', false],
    ]
  );

  const found = await service.list({ search: 'warm HELLO', page: 1, limit: 20 });
  assert.deepEqual(found.templates.map((template) => template.key), ['welcome']);

  const paged = await service.list({ page: 2, limit: 3 });
  assert.deepEqual(paged.templates.map((template) => template.key), ['password_changed']);
  assert.equal(paged.pages, 2);
});

test('a preview of a draft reports what is wrong instead of refusing', async () => {
  const draft = { ...DEFAULTS.verify_email.content, body: '<p>Hi {{first_name}}, welcome.</p>' };
  const preview = await service.preview('verify_email', draft);
  assert.match(preview.html, /<p>Hi Alex, welcome\.<\/p>/);
  assert.match(preview.problems.join(' '), /must contain \{\{code\}\}/);
});

test('an email that does not exist is not found', async () => {
  for (const key of ['newsletter', '__proto__', 'constructor']) {
    await assert.rejects(service.get(key), (err) => err.statusCode === 404, key);
  }
});
