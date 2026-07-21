export const formatMoney = (amount, currency = '₹') =>
  `${currency}${Math.abs(amount).toFixed(2)}`;

export const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const initials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
