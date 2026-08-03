// Deterministic pseudo-presence until a real presence system exists. Hashing
// the user id keeps each member's status stable across screens and reloads.
const OPTIONS = [
  { label: 'Active now', online: true },
  { label: 'Active 5m ago', online: true },
  { label: 'Active 1 hour ago', online: false },
  { label: 'Offline', online: false },
];

const hash = (value = '') => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 9973;
  return h;
};

export const presenceFor = (userId, isSelf = false) => {
  if (isSelf) return OPTIONS[0];
  return OPTIONS[hash(String(userId)) % OPTIONS.length];
};

// Stable placeholder phone number; the backend doesn't store phones yet.
export const phoneFor = (userId = '') => {
  const h = hash(String(userId));
  const mid = 200 + (h % 700);
  const last = 1000 + ((h * 7) % 9000);
  return `+1 (555) ${mid}-${last}`;
};
