const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Turns "is connected right now" (from the socket) plus "when they last
 * disconnected" (from the backend's lastSeenAt) into the { online, label }
 * shape the member screens render.
 */
export const presenceFrom = (online, lastSeenAt) => {
  if (online) return { online: true, label: 'Active now' };
  if (!lastSeenAt) return { online: false, label: 'Offline' };
  const age = Date.now() - new Date(lastSeenAt).getTime();
  if (age < MINUTE) return { online: false, label: 'Active just now' };
  if (age < HOUR) return { online: false, label: `Active ${Math.round(age / MINUTE)}m ago` };
  if (age < 24 * HOUR) return { online: false, label: `Active ${Math.round(age / HOUR)}h ago` };
  return { online: false, label: 'Offline' };
};

const hash = (value = '') => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 9973;
  return h;
};

// Stable placeholder phone number; the backend doesn't store phones yet.
export const phoneFor = (userId = '') => {
  const h = hash(String(userId));
  const mid = 200 + (h % 700);
  const last = 1000 + ((h * 7) % 9000);
  return `+1 (555) ${mid}-${last}`;
};
