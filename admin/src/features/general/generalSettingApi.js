import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const BASE_URL = import.meta.env.VITE_BASE_URL ||'http://localhost:3000';

export const generalSettingApi = createApi({
  reducerPath: 'generalSettingApi',
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['generalSetting'],
  endpoints: (builder) => ({
    getSettings: builder.query({
      query: (section) => `/api/setting/${section.toString()}`,
      providesTags: (_result, _error, section) => [
        { type: 'generalSetting', id: section },
      ],
    }),
    updateSettings: builder.mutation({
      query: ({ section, data }) => ({
        url: `/api/setting/${section.toString()}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { section }) => [
        { type: 'generalSetting', id: section },
      ],
    }),
  }),
});

export const { useGetSettingsQuery, useUpdateSettingsMutation } =
  generalSettingApi;
