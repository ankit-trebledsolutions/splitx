import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// The outside services Splix runs on — Resend, OpenAI, Cloudinary, Stream,
// Google Sign-In — and the keys each one uses. Owners only, on the server too.
//
// A secret travels one way. It is sent when an admin types a new one and is
// never sent back: what the panel is shown of a saved key is its last four
// characters. So an empty box means "leave it as it is", here and on the
// server.

export const integrationsApi = createApi({
  reducerPath: 'integrationsApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['Integration', 'IntegrationChange'],
  endpoints: (builder) => ({
    getIntegrations: builder.query({
      query: () => '/integrations',
      transformResponse: (response) => {
        const data = unwrap(response);
        return {
          integrations: data.integrations || [],
          canSaveSecrets: Boolean(data.canSaveSecrets),
        };
      },
      providesTags: ['Integration'],
    }),
    getIntegrationChanges: builder.query({
      query: () => '/integrations/changes',
      transformResponse: (response) => unwrap(response).changes || [],
      providesTags: ['IntegrationChange'],
    }),
    // Asks the provider whether it accepts the keys. Saves nothing, and
    // answers normally when the provider says no: that is the answer.
    testIntegration: builder.mutation({
      query: ({ key, values }) => ({
        url: `/integrations/${key}/test`,
        method: 'POST',
        body: { values },
      }),
      transformResponse: (response) => unwrap(response).test,
    }),
    // The server runs the same check before it stores anything, and refuses
    // a key the provider turned away.
    updateIntegration: builder.mutation({
      query: ({ key, values, password }) => ({
        url: `/integrations/${key}`,
        method: 'PUT',
        body: { values, password },
      }),
      transformResponse: unwrap,
      invalidatesTags: ['Integration', 'IntegrationChange'],
    }),
    resetIntegration: builder.mutation({
      query: ({ key, password }) => ({
        url: `/integrations/${key}/reset`,
        method: 'POST',
        body: { password },
      }),
      transformResponse: unwrap,
      invalidatesTags: ['Integration', 'IntegrationChange'],
    }),
  }),
});

export const {
  useGetIntegrationsQuery,
  useGetIntegrationChangesQuery,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
  useResetIntegrationMutation,
} = integrationsApi;
