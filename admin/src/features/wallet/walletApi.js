import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// Credits: what people hold and spend in the app, what each feature costs,
// and the admins' own hand on it (granting or taking away credits for one
// person). Prices and allowances are owners only; the server refuses a
// co-admin who tries, so the page only hides the form as a courtesy.
//
// Nothing here is ever edited or deleted: every change is a new row in the
// history, and the balance is that history added up.

const userWalletTag = (id) => ({ type: 'UserWallet', id });
const ACTIVITY = { type: 'WalletTransaction', id: 'LIST' };

const pageOf = (data) => ({
  items: data?.items || [],
  total: data?.total ?? 0,
  page: data?.page ?? 1,
  pages: data?.pages ?? 1,
});

export const walletApi = createApi({
  reducerPath: 'walletApi',
  baseQuery: adminBaseQuery,
  tagTypes: [
    'WalletSummary',
    'WalletSettings',
    'WalletTransaction',
    'UserWallet',
  ],
  endpoints: (builder) => ({
    getWalletSummary: builder.query({
      query: () => '/wallet/summary',
      transformResponse: unwrap,
      providesTags: ['WalletSummary'],
    }),
    getWalletSettings: builder.query({
      query: () => '/wallet/settings',
      transformResponse: (response) => unwrap(response).settings,
      providesTags: ['WalletSettings'],
    }),
    // The summary carries the settings too, so it is refreshed with them.
    updateWalletSettings: builder.mutation({
      query: (body) => ({ url: '/wallet/settings', method: 'PUT', body }),
      transformResponse: (response) => unwrap(response).settings,
      invalidatesTags: ['WalletSettings', 'WalletSummary'],
    }),
    getWalletTransactions: builder.query({
      query: ({ type = '', feature = '', page = 1, limit = 10 } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (type) params.set('type', type);
        if (feature) params.set('feature', feature);
        return `/wallet/transactions?${params.toString()}`;
      },
      transformResponse: (response) => pageOf(unwrap(response)),
      providesTags: [ACTIVITY],
    }),
    // One person's balance and a page of their history. Answers 404 for an
    // account the signed-in admin may not see (an owner, for a co-admin).
    getUserWallet: builder.query({
      query: ({ id, page = 1, limit = 5 }) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        return `/wallet/users/${id}?${params.toString()}`;
      },
      transformResponse: (response) => {
        const data = unwrap(response);
        return {
          wallet: data.wallet,
          transactions: pageOf(data.transactions),
        };
      },
      providesTags: (_result, _error, { id }) => [userWalletTag(id)],
    }),
    // `requestId` is the panel's name for this one adjustment: the server
    // applies a given id once, so a double click or a retry cannot grant twice.
    adjustUserWallet: builder.mutation({
      query: ({ id, type, amount, reason, requestId }) => ({
        url: `/wallet/users/${id}/adjust`,
        method: 'POST',
        body: { type, amount, reason, requestId },
      }),
      transformResponse: unwrap,
      invalidatesTags: (_result, _error, { id }) => [
        userWalletTag(id),
        ACTIVITY,
        'WalletSummary',
      ],
    }),
  }),
});

export const {
  useGetWalletSummaryQuery,
  useGetWalletSettingsQuery,
  useUpdateWalletSettingsMutation,
  useGetWalletTransactionsQuery,
  useGetUserWalletQuery,
  useAdjustUserWalletMutation,
} = walletApi;
