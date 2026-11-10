import client from './client';

// The person's credits and today's prices:
// { balance, free, paid, monthlyFree, freeRenewsAt,
//   prices: { aiItinerary, callBlock, callBlockMinutes } }
// A server from before wallets answers 404.
export const getWallet = async () => {
  const { data } = await client.get('/wallet');
  return data.data.wallet;
};

// One page of the credit history, newest first:
// { items: [{ id, type, amount, feature, balanceAfter, freeAfter, createdAt }], total, page, pages,
//   totals: { credited, debited } }
// `direction` keeps one side: 'in' (credits that came in) or 'out' (went out).
// `totals` are all-time and always cover both sides. A server from before them
// sends no `totals` and ignores `direction`.
export const getWalletTransactions = async ({ page = 1, limit = 20, direction } = {}) => {
  const params = { page, limit };
  if (direction) params.direction = direction;
  const { data } = await client.get('/wallet/transactions', { params });
  return data.data;
};
