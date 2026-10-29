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
// { items: [{ id, type, amount, feature, balanceAfter, freeAfter, createdAt }], total, page, pages }
export const getWalletTransactions = async ({ page = 1, limit = 20 } = {}) => {
  const { data } = await client.get('/wallet/transactions', { params: { page, limit } });
  return data.data;
};
