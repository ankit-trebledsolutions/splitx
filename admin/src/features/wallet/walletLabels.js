// How the panel names what the server stores about credits. The keys are the
// server's (backend/src/models/CreditTransaction.js); the words and colours
// are the panel's, kept in one place so a row reads the same on the Wallet
// page and on a person's Credits card.

export { formatWhen, plural } from '@/features/support/supportLabels';

// Grants and deductions are the admins' own; the rest the app does by itself.
export const TYPES = [
  { key: 'grant', label: 'Granted', variant: 'success' },
  { key: 'deduct', label: 'Deducted', variant: 'destructive' },
  { key: 'spend', label: 'Spent', variant: 'primary' },
  { key: 'refund', label: 'Refunded', variant: 'warning' },
  { key: 'bonus', label: 'Signup bonus', variant: 'info' },
  { key: 'monthly', label: 'Monthly free credits', variant: 'secondary' },
];

// What a spend (or its refund) paid for.
export const FEATURES = [
  { key: 'ai_itinerary', label: 'AI itinerary plan' },
  { key: 'call', label: 'Group call' },
];

export const typeOf = (key) =>
  TYPES.find((entry) => entry.key === key) ?? {
    key,
    label: key || 'Unknown',
    variant: 'secondary',
  };

// Null for a row that is not about a feature (a grant, a bonus).
export const featureOf = (key) =>
  key
    ? (FEATURES.find((entry) => entry.key === key) ?? { key, label: key })
    : null;

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// 1,234
export const formatCredits = (value) => whole.format(toNumber(value));

// +50, −20, 0. A real minus sign, which a screen reader says out loud.
export const formatSignedCredits = (value) => {
  const number = toNumber(value);
  if (number > 0) return `+${whole.format(number)}`;
  if (number < 0) return `−${whole.format(Math.abs(number))}`;
  return '0';
};

// Green for credits coming in, red for credits going out.
export const amountTone = (value) => {
  const number = toNumber(value);
  if (number > 0) return 'text-green-600 dark:text-green-500';
  if (number < 0) return 'text-destructive';
  return 'text-muted-foreground';
};

// How a change split between the two pots, for a tooltip on its amount.
export const splitOf = (row) =>
  `Free ${formatSignedCredits(row?.free)} · Paid ${formatSignedCredits(row?.paid)}`;

/**
 * The last 30 days in the words of the summary cards, from the server's rows
 * of { type, feature, amount, count }. Amounts are signed (a spend is
 * negative), so the ones that take credits away are turned positive here:
 * "spent 40" reads better than "spent −40".
 */
export const lastThirtyDays = (rows = []) => {
  const sum = (match) =>
    rows.filter(match).reduce(
      (total, row) => ({
        amount: total.amount + toNumber(row.amount),
        count: total.count + toNumber(row.count),
      }),
      { amount: 0, count: 0 },
    );
  const positive = ({ amount, count }) => ({ amount: Math.abs(amount), count });

  return {
    granted: sum((row) => row.type === 'grant'),
    deducted: positive(sum((row) => row.type === 'deduct')),
    spentOnAi: positive(
      sum((row) => row.type === 'spend' && row.feature === 'ai_itinerary'),
    ),
    spentOnCalls: positive(
      sum((row) => row.type === 'spend' && row.feature === 'call'),
    ),
    refunded: sum((row) => row.type === 'refund'),
    bonuses: sum((row) => row.type === 'bonus'),
    // Signed on purpose: lowering the monthly allowance makes a negative one.
    monthly: sum((row) => row.type === 'monthly'),
  };
};

// A fresh id for one adjustment. crypto.randomUUID only exists on https and
// localhost; anywhere else the same version 4 id is built by hand from the
// random bytes the browser always has.
export const newRequestId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
};
