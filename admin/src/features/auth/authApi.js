import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// Panel sign-in. There is deliberately no signup endpoint: treble-d exposed a
// public one on the admin API, which let anyone create an account on it. Staff
// are made by a super admin from inside the panel, or by the seed script.

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['Auth'],
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: unwrap,
      invalidatesTags: ['Auth'],
    }),
    logout: builder.mutation({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth'],
    }),
    // Called on every load to restore the session from the cookie, since the
    // panel cannot read the cookie itself to find out whether one exists.
    getCurrentUser: builder.query({
      query: () => '/auth/me',
      transformResponse: unwrap,
      providesTags: ['Auth'],
    }),
    // The module list comes from the server so a module added in
    // backend/src/config/permissions.js shows up in the matrix without a
    // frontend change.
    getModules: builder.query({
      query: () => '/meta/modules',
      transformResponse: unwrap,
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useGetCurrentUserQuery,
  useGetModulesQuery,
} = authApi;
