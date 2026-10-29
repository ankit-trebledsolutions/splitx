import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// The figures behind the dashboard: how many users, groups, expenses and AI
// plans there are, and how each moved over the chosen period. One request
// answers the whole page, so every card is counting the same days.
//
// The time zone goes along because "the last 30 days" means calendar days
// where the admin is sitting, and only the browser knows where that is.

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: adminBaseQuery,
  endpoints: (builder) => ({
    getDashboard: builder.query({
      query: ({ days, timezone }) =>
        `/dashboard?days=${days}&tz=${encodeURIComponent(timezone)}`,
      transformResponse: unwrap,
    }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
