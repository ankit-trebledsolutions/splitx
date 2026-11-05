const crypto = require('crypto');

/**
 * Group invite codes.
 *
 * New codes are 13 characters from Crockford's base32 alphabet: digits and
 * capital letters without I, L, O and U, so a code read aloud or copied by hand
 * has no look-alike letters. 13 x 5 bits = 65 bits, far beyond guessing even
 * without the per-account brake in middleware/guessLimiter.js.
 *
 * Groups made before this keep their 8-hex-character code (32 bits); it still
 * works everywhere, because the lookups compare codes as stored, uppercased.
 *
 * Both lengths fit the rule app builds already in people's hands use for a
 * code in a link (letters and digits, 4 to 16 of them), so links to new groups
 * open in those builds too.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 13;

const newInviteCode = () => {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
};

// What a code can look like, old or new. Anything else is never looked up.
const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{8,16}$/;

module.exports = { newInviteCode, INVITE_CODE_PATTERN, INVITE_CODE_LENGTH: LENGTH };
