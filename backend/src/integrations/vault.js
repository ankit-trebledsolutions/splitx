const crypto = require('crypto');
const env = require('../config/env');

/**
 * Locks and unlocks the API keys kept in the database.
 *
 * AES-256-GCM, which does two jobs: nobody can read a stored key without
 * SETTINGS_ENCRYPTION_KEY, and nobody can change one without it either — a
 * value altered in the database fails to open instead of opening as something
 * else.
 *
 * Every value is also tied to the place it was stored for ("resend.apiKey").
 * Without that, somebody able to write to the database could copy the locked
 * R2 secret into the Resend slot and have the server send it to
 * Resend as if it were a Resend key.
 */
const VERSION = 'v1';

// The variable can be any long random text, so it is stretched into a key of
// exactly the right size. Done once: scrypt is slow on purpose.
let derived = null;
const key = () => {
  if (!env.settingsKey) return null;
  if (!derived || derived.from !== env.settingsKey) {
    derived = {
      from: env.settingsKey,
      key: crypto.scryptSync(env.settingsKey, 'splix.integration-settings', 32),
    };
  }
  return derived.key;
};

const isReady = () => Boolean(env.settingsKey);

const seal = (plain, slot) => {
  const secret = key();
  if (!secret) throw new Error('SETTINGS_ENCRYPTION_KEY is not set');

  // A fresh random value every time: the same key saved twice never looks the same.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(Buffer.from(slot, 'utf8'));
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);

  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part))
    .join('.');
};

// Throws for anything that does not open cleanly: a wrong or missing key, a
// value that was altered, or one that was stored for a different slot.
const open = (sealed, slot) => {
  const secret = key();
  if (!secret) throw new Error('SETTINGS_ENCRYPTION_KEY is not set');

  const [version, iv, tag, data] = String(sealed).split('.');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Stored value is not in a format this server understands');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(slot, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

// All the panel ever shows of a key once it is saved: enough to tell two keys
// apart, not enough to be of use to anyone.
const hintOf = (plain) => {
  const value = String(plain);
  return value.length >= 12 ? value.slice(-4) : '';
};

module.exports = { isReady, seal, open, hintOf };
