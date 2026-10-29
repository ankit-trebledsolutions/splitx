import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// Force update: which builds of the app are still allowed in, per platform,
// and where the newest one is. Owners only, on the server too.
//
// { android: { minBuild, latestBuild, latestVersion, downloadUrl, notes },
//   ios: { ...the same }, updatedAt }
//
// A phone on a build below `minBuild` is locked behind an update screen on
// its very next request, so raising it is the one change in the panel that
// shuts people out of the app at once.

export const appReleaseApi = createApi({
  reducerPath: 'appReleaseApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['AppRelease'],
  endpoints: (builder) => ({
    getAppRelease: builder.query({
      query: () => '/app-release',
      transformResponse: (response) => unwrap(response).settings,
      providesTags: ['AppRelease'],
    }),
    updateAppRelease: builder.mutation({
      query: (body) => ({ url: '/app-release', method: 'PUT', body }),
      transformResponse: (response) => unwrap(response).settings,
      invalidatesTags: ['AppRelease'],
    }),
  }),
});

export const { useGetAppReleaseQuery, useUpdateAppReleaseMutation } =
  appReleaseApi;
