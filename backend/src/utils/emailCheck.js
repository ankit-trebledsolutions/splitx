const dns = require('dns').promises;

// Some machines and hosts have a system resolver Node can't query (every lookup
// fails with ECONNREFUSED). Public resolvers are the second opinion.
const publicDns = new dns.Resolver({ timeout: 2500, tries: 1 });
publicDns.setServers(['1.1.1.1', '8.8.8.8']);
const ApiError = require('./ApiError');

/**
 * Cheap checks run before a verification code is sent. None of them can prove
 * an address is real (only the code landing in the inbox does that); they just
 * catch typos and throwaway addresses early, with a message the person can act on.
 */

// Common slips when typing the big providers' domains.
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmal.com': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.om': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.con': 'icloud.com',
  'rediffmai.com': 'rediffmail.com', 'redifmail.com': 'rediffmail.com',
};

// Well-known throwaway inbox services. Not exhaustive (new ones appear daily);
// it stops the casual case, and the emailed code stops the rest.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'tempmail.net', 'tempmailo.com', 'tempail.com', 'throwawaymail.com', 'yopmail.com', 'yopmail.fr',
  'yopmail.net', 'getnada.com', 'nada.email', 'trashmail.com', 'trashmail.net', 'trash-mail.com',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'fakeinbox.com',
  'fakemail.net', 'emailondeck.com', 'moakt.com', 'mytemp.email', 'tempinbox.com', 'spamgourmet.com',
  'mailcatch.com', 'inboxbear.com', 'burnermail.io', 'discard.email', 'discardmail.com',
  'spambox.us', 'mailsac.com', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'luxusmail.org',
  'emailfake.com', 'generator.email', 'cs.email', 'harakirimail.com', 'mail-temp.com', 'tempr.email',
  'minuteinbox.com', 'mailpoof.com', 'anonbox.net', 'easytrashmail.com', '1secmail.com',
  '1secmail.net', '1secmail.org', 'byom.de', 'dropmail.me', 'linshiyouxiang.net',
]);

const DNS_TIMEOUT_MS = 3000;

const withTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS);
    }),
  ]);

// A domain can receive mail if it has MX records, or failing that an address
// record (mail falls back to it). "Not found" is the only answer treated as a
// no: a slow or failing DNS server must not block a genuine sign-up.
const MISSING = ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'];

// 'yes' | 'no' | 'unknown' from one resolver.
const askResolver = async (resolver, domain) => {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain));
    if (mx.some((record) => record.exchange && record.exchange !== '.')) return 'yes';
  } catch (err) {
    if (!MISSING.includes(err.code)) return 'unknown';
  }
  try {
    await withTimeout(resolver.resolve4(domain));
    return 'yes';
  } catch (err) {
    return MISSING.includes(err.code) ? 'no' : 'unknown';
  }
};

const domainAcceptsMail = async (domain) => {
  let answer = await askResolver(dns, domain);
  if (answer === 'unknown') answer = await askResolver(publicDns, domain);
  // Still unknown means DNS itself is down: let the sign-up through. The
  // emailed code is the real test anyway.
  return answer !== 'no';
};

/**
 * Throws a 400 with a helpful message if the address is clearly unusable.
 * Returns the normalised (trimmed, lower-cased) address otherwise.
 */
const assertUsableEmail = async (rawEmail) => {
  const email = String(rawEmail).trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!domain) throw ApiError.badRequest('A valid email is required');

  if (TYPO_DOMAINS[domain]) {
    throw ApiError.badRequest(
      `Did you mean ${email.split('@')[0]}@${TYPO_DOMAINS[domain]}? Please check your email address.`
    );
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    throw ApiError.badRequest('Temporary email addresses are not supported. Please use your regular email.');
  }
  if (!(await domainAcceptsMail(domain))) {
    throw ApiError.badRequest(`"${domain}" can't receive email. Please check your email address.`);
  }
  return email;
};

module.exports = { assertUsableEmail };
