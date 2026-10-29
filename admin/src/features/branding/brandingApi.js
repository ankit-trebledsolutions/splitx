import { createApi } from '@reduxjs/toolkit/query/react';
import { API_URL, adminBaseQuery, unwrap } from '@/lib/api';

// The app's name and logo (General Settings > Branding). Owners only on the
// server, like the release settings.
//
// { appName, logoUrl, updatedAt }   logoUrl is a full address, or null for
//                                   the built-in Splix mark.
//
// The panel itself draws the name and logo in its sidebar and on the sign-in
// page. The sign-in page has no session, so what it draws comes from the
// public endpoint the app reads (GET /api/v1/app/branding), fetched here
// directly since it lives outside /admin. One slice and one tag for both, so
// a save on the Branding page redraws the sidebar in the same breath.

export const brandingApi = createApi({
  reducerPath: 'brandingApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['Branding'],
  endpoints: (builder) => ({
    getBranding: builder.query({
      query: () => '/branding',
      transformResponse: (response) => unwrap(response).settings,
      providesTags: ['Branding'],
    }),
    // Public, no session needed: { appName, logoUrl, inviteBaseUrl, updatedAt }.
    getPublicBranding: builder.query({
      queryFn: async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/app/branding`, { credentials: 'omit' });
          if (!res.ok) return { error: { status: res.status, data: await res.text() } };
          return { data: unwrap(await res.json()).branding };
        } catch (err) {
          return { error: { status: 'FETCH_ERROR', error: String(err) } };
        }
      },
      providesTags: ['Branding'],
    }),
    updateBranding: builder.mutation({
      query: (body) => ({ url: '/branding', method: 'PUT', body }),
      transformResponse: (response) => unwrap(response).settings,
      invalidatesTags: ['Branding'],
    }),
    uploadLogo: builder.mutation({
      query: (file) => {
        const body = new FormData();
        body.append('logo', file);
        return { url: '/branding/logo', method: 'POST', body };
      },
      transformResponse: (response) => unwrap(response).settings,
      invalidatesTags: ['Branding'],
    }),
    removeLogo: builder.mutation({
      query: () => ({ url: '/branding/logo', method: 'DELETE' }),
      transformResponse: (response) => unwrap(response).settings,
      invalidatesTags: ['Branding'],
    }),
  }),
});

export const {
  useGetBrandingQuery,
  useGetPublicBrandingQuery,
  useUpdateBrandingMutation,
  useUploadLogoMutation,
  useRemoveLogoMutation,
} = brandingApi;
