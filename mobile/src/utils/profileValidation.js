// Client-side copies of the rules in backend/src/routes/auth.routes.js, so a
// mistake is shown on the field instead of coming back from the server. The
// server still has the last word (and is the only one that knows whether a
// username is taken).

export const BIO_MAX = 160;

export const normalizeUsername = (value) => value.trim().replace(/^@/, '').toLowerCase();

export const usernameError = (value) => {
  const username = normalizeUsername(value);
  if (!username) return 'Choose a username';
  if (!/^[a-z0-9._]{3,20}$/.test(username)) {
    return '3-20 letters, numbers, dots or underscores';
  }
  return undefined;
};

export const phoneError = (value) => {
  const phone = value.trim();
  if (!phone) return 'Enter your phone number';
  const digits = phone.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return 'Enter a valid phone number';
  }
  return undefined;
};

export const nameError = (value) =>
  value.trim().length < 2 ? 'Enter your full name' : undefined;

export const bioError = (value) =>
  value.trim().length > BIO_MAX ? `Keep it under ${BIO_MAX} characters` : undefined;
