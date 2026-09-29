require('../testkit/safeEnv');

/**
 * The lock on the API keys kept in the database.
 *
 * What is promised to the admin is that the database on its own gives nothing
 * away, and that nobody can quietly swap one stored key for another. Each test
 * here is one way that promise could be broken.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const vault = require('../src/integrations/vault');

const KEY = 're_live_4f8Kq2mXw9ZtB7cN';
const SLOT = 'resend.apiKey';

// Runs with a different SETTINGS_ENCRYPTION_KEY, then puts the real one back.
const withSettingsKey = (value, run) => {
  const original = env.settingsKey;
  env.settingsKey = value;
  try {
    return run();
  } finally {
    env.settingsKey = original;
  }
};

test('a key comes back out exactly as it went in', () => {
  assert.equal(vault.open(vault.seal(KEY, SLOT), SLOT), KEY);
  // Including characters a careless encoding would mangle.
  const awkward = 'pä$$ wörd=+/&?\n"quoted" 日本語';
  assert.equal(vault.open(vault.seal(awkward, SLOT), SLOT), awkward);
});

test('what is stored does not contain the key, or any recognisable part of it', () => {
  const sealed = vault.seal(KEY, SLOT);
  assert.ok(!sealed.includes(KEY));
  assert.ok(!sealed.includes('re_live'));
  assert.ok(!sealed.includes(Buffer.from(KEY).toString('base64').slice(0, 12)));
  assert.ok(!sealed.includes(Buffer.from(KEY).toString('base64url').slice(0, 12)));
});

test('the same key saved twice never looks the same', () => {
  // Otherwise the database would show which services share a key, and whether
  // a key was changed back to an earlier one.
  assert.notEqual(vault.seal(KEY, SLOT), vault.seal(KEY, SLOT));
});

test('a stored value that was altered does not open', () => {
  const sealed = vault.seal(KEY, SLOT);
  const parts = sealed.split('.');

  for (const index of [1, 2, 3]) {
    const bytes = Buffer.from(parts[index], 'base64url');
    bytes[0] ^= 0x01;
    const altered = parts.map((part, at) => (at === index ? bytes.toString('base64url') : part)).join('.');
    assert.throws(() => vault.open(altered, SLOT), `part ${index}`);
  }
});

test('a value stored for one service cannot be moved to another', () => {
  // Somebody who can write to the database copies the Cloudinary secret into
  // the Resend slot, hoping the server sends it to Resend as a Resend key.
  const sealed = vault.seal('cloudinary-secret-value', 'cloudinary.apiSecret');
  assert.throws(() => vault.open(sealed, 'resend.apiKey'));
  assert.equal(vault.open(sealed, 'cloudinary.apiSecret'), 'cloudinary-secret-value');
});

test('a different encryption key opens nothing', () => {
  const sealed = vault.seal(KEY, SLOT);
  withSettingsKey('a-completely-different-key-0123456789', () => {
    assert.throws(() => vault.open(sealed, SLOT));
  });
  assert.equal(vault.open(sealed, SLOT), KEY);
});

test('with no encryption key set, nothing is stored unlocked instead', () => {
  withSettingsKey('', () => {
    assert.equal(vault.isReady(), false);
    assert.throws(() => vault.seal(KEY, SLOT), /SETTINGS_ENCRYPTION_KEY/);
  });
  assert.equal(vault.isReady(), true);
});

test('junk in the database is refused, not guessed at', () => {
  for (const junk of ['', 'plain-text-key', 'v1.only.three', 'v2.a.b.c', KEY]) {
    assert.throws(() => vault.open(junk, SLOT), JSON.stringify(junk));
  }
});

test('the hint is the last four characters, and nothing for a key too short to hide', () => {
  assert.equal(vault.hintOf(KEY), 'B7cN');
  // Four characters of an eight-character secret would be half of it.
  assert.equal(vault.hintOf('short'), '');
  assert.equal(vault.hintOf(''), '');
});
