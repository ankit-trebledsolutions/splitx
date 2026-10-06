const { StreamClient } = require('@stream-io/node-sdk');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../config/env');
const r2Storage = require('../storage/r2.storage');

/**
 * Asks each provider whether it accepts a set of keys, before they are saved.
 *
 * A key that is wrong takes its feature down for everyone the moment it is
 * saved — a mistyped Resend key and nobody can sign up. So saving runs one of
 * these first and refuses a key the provider turned away.
 *
 * Each returns { ok, message, note? }. `message` is written for the admin and
 * never contains a key. `note` is for something that is fine to save but worth
 * knowing. A provider that cannot be reached at all is a failure too: keys
 * that could not be checked are not saved as if they had been.
 */

const TIMEOUT_MS = 10 * 1000;

const refuseInTests = (what) => () => {
  throw new Error(`No outside calls in tests: mock testers.outside.${what}`);
};

// Every call that leaves the server goes through here, so tests can replace
// them and can never reach a real provider by forgetting to.
const outside = {
  fetch:
    env.nodeEnv === 'test'
      ? refuseInTests('fetch')
      : (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
  streamApp:
    env.nodeEnv === 'test'
      ? refuseInTests('streamApp')
      : (apiKey, apiSecret) => new StreamClient(apiKey, apiSecret, { timeout: TIMEOUT_MS }).getApp(),
  // Stores a tiny file and removes it again: proves the keys, the bucket and
  // the token's permission on it in one go, which is exactly what uploads need.
  r2PutAndRemove:
    env.nodeEnv === 'test'
      ? refuseInTests('r2PutAndRemove')
      : async (keys) => {
          const client = r2Storage.clientFor(keys);
          const probe = { Bucket: keys.bucket, Key: '.splix-connection-test' };
          const options = { abortSignal: AbortSignal.timeout(TIMEOUT_MS) };
          try {
            await client.send(new PutObjectCommand({ ...probe, Body: 'ok', ContentType: 'text/plain' }), options);
            await client.send(new DeleteObjectCommand(probe), options);
          } finally {
            client.destroy();
          }
        },
};

const ok = (message, note) => ({ ok: true, message, ...(note ? { note } : {}) });
const failed = (message) => ({ ok: false, message });

const unreachable = (name) =>
  failed(`${name} could not be reached, so the keys could not be checked. Try again in a moment.`);

const json = (res) => res.json().catch(() => null);

// "Splix <noreply@splix.app>" and "noreply@splix.app" both give "splix.app".
const domainOf = (from) => (/@([^\s<>@]+?)>?\s*$/.exec(String(from)) || [])[1]?.toLowerCase() || '';

const resend = async ({ apiKey, from }) => {
  if (!apiKey) return failed('Enter the API key.');
  if (!from) return failed('Enter the sender address.');

  let res;
  try {
    res = await outside.fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return unreachable('Resend');
  }
  const body = await json(res);

  // A key made with "Sending access" only. It sends perfectly well; it is
  // just not allowed to list the account's domains, so the sender address
  // cannot be checked from here.
  if (res.status === 401 && body?.name === 'restricted_api_key') {
    return ok(
      'Resend accepted the key.',
      'This key can only send, so the sender address could not be checked. Use "Send test to me" on an email template to make sure emails arrive.'
    );
  }
  if (res.status === 401 || res.status === 403) {
    return failed('Resend did not accept this key. Copy it again from Resend > API Keys.');
  }
  if (!res.ok) return failed(`Resend answered with an error (${res.status}). Try again in a moment.`);

  const domain = domainOf(from);
  if (domain === 'resend.dev') {
    return ok(
      'Resend accepted the key.',
      'The sender is Resend\'s test address, which only delivers to the inbox of the Resend account owner. Verify your own domain before real people sign up.'
    );
  }

  const verified = (body?.data || []).filter((entry) => entry.status === 'verified').map((entry) => entry.name);
  const allowed = verified.some((name) => domain === name || domain.endsWith(`.${name}`));
  if (!allowed) {
    return failed(
      verified.length
        ? `Resend accepted the key, but ${domain} is not a verified domain in that account. Verified there: ${verified.join(', ')}.`
        : `Resend accepted the key, but no domain is verified in that account yet, so emails from ${domain} would be refused. Verify the domain in Resend first.`
    );
  }
  return ok(`Resend accepted the key, and ${domain} is verified.`);
};

const openai = async ({ apiKey, model, fallbackModel, baseUrl = env.openai.baseUrl }) => {
  if (!apiKey) return failed('Enter the API key.');

  const lookUp = async (name) => {
    const res = await outside.fetch(`${baseUrl}/models/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.status;
  };

  let status;
  try {
    status = await lookUp(model);
  } catch {
    return unreachable('OpenAI');
  }

  if (status === 401) return failed('OpenAI did not accept this key. Copy it again from OpenAI > API keys.');
  // A key restricted to certain permissions may be refused the model list and
  // still be allowed to write plans.
  if (status === 403) {
    return ok(
      'OpenAI accepted the key.',
      'This key is not allowed to look up models, so the model names could not be checked.'
    );
  }
  if (status >= 500) return failed(`OpenAI answered with an error (${status}). Try again in a moment.`);

  if (status === 404) {
    const fallback = await lookUp(fallbackModel).catch(() => 0);
    if (fallback !== 200) {
      return failed(
        `OpenAI accepted the key, but it has no access to the model "${model}" or to the fallback "${fallbackModel}". Check the names on OpenAI's models page.`
      );
    }
    return ok(
      'OpenAI accepted the key.',
      `It has no access to the model "${model}", so plans will be written by the fallback "${fallbackModel}".`
    );
  }
  if (status !== 200) return failed(`OpenAI answered with an error (${status}). Try again in a moment.`);

  return ok(`OpenAI accepted the key, and it can use the model "${model}".`);
};

const R2_REFUSED = new Set(['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDenied', 'Unauthorized']);

const r2 = async ({ accountId, accessKeyId, secretAccessKey, bucket }) => {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return failed(
      'Cloudflare R2 needs all four: the account ID, the Access Key ID, the Secret Access Key and the bucket name.'
    );
  }
  // definitions.js refuses such an ID before it gets here; this is the second
  // lock, since the ID becomes part of the address the keys are sent to.
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return failed('The account ID is 32 letters and numbers.');

  try {
    await outside.r2PutAndRemove({ accountId, accessKeyId, secretAccessKey, bucket });
  } catch (err) {
    // The S3 client reports what R2 answered as a code and an HTTP status;
    // anything without one never reached R2.
    const status = err?.$metadata?.httpStatusCode;
    const code = err?.name || err?.Code || '';
    if (code === 'NoSuchBucket' || status === 404) {
      return failed(`Cloudflare R2 has no bucket called "${bucket}" in this account.`);
    }
    if (R2_REFUSED.has(code) || status === 401 || status === 403) {
      return failed(
        'Cloudflare R2 did not accept these keys. Check that they come from the same account, and that the token has Object Read & Write on this bucket.'
      );
    }
    if (status) return failed(`Cloudflare R2 answered with an error (${status}). Try again in a moment.`);
    return unreachable('Cloudflare R2');
  }
  return ok('Cloudflare R2 accepted the keys, and files can be stored in the bucket.');
};

const stream = async ({ apiKey, apiSecret }) => {
  if (!apiKey || !apiSecret) return failed('Stream needs both the key and the secret.');

  try {
    await outside.streamApp(apiKey, apiSecret);
  } catch (err) {
    // Stream answers a wrong key or secret with 401 or 403. Anything else is
    // the network or Stream itself.
    const status = err?.metadata?.responseCode ?? err?.status ?? err?.response?.status;
    if (status === 401 || status === 403 || /signature|api[_ ]?key|unauthori[sz]ed|forbidden/i.test(err?.message || '')) {
      return failed('Stream did not accept this key and secret. Copy both again from the app\'s App Access Keys.');
    }
    return unreachable('Stream');
  }
  return ok('Stream accepted the key and the secret.');
};

// Google has nothing to ask: a client ID is only proven when a phone signs in
// with it. What can be checked is that each one has the shape of a client ID,
// which definitions.js already does.
const google = async (values) => {
  const given = Object.values(values).filter(Boolean);
  if (given.length === 0) return failed('Enter at least one client ID.');
  return ok(
    'The client IDs look right.',
    'They can only be proven by signing in from an app version that was built with them.'
  );
};

module.exports = { outside, resend, openai, r2, stream, google };
