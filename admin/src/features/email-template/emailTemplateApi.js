import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:3000';

export const emailTemplateApi = createApi({
  reducerPath: 'emailTemplateApi',
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['EmailTemplate'],
  endpoints: (builder) => ({
    getEmailTemplates: builder.query({
      query: ({ search = '', page = 1, limit = 5 } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
          params.set('search', trimmedSearch);
        }

        return `/api/email-template?${params.toString()}`;
      },
      providesTags: ['EmailTemplate'],
    }),
    getEmailTemplateById: builder.query({
      query: (id) => `/api/email-template/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'EmailTemplate', id }],
    }),
    createEmailTemplate: builder.mutation({
      query: (templateData) => ({
        url: '/api/email-template',
        method: 'POST',
        body: templateData,
      }),
      invalidatesTags: ['EmailTemplate'],
    }),
    updateEmailTemplate: builder.mutation({
      query: ({ id, templateData }) => ({
        url: `/api/email-template/${id}`,
        method: 'PUT',
        body: templateData,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        'EmailTemplate',
        { type: 'EmailTemplate', id },
      ],
    }),
    toggleEmailTemplateStatus: builder.mutation({
      query: (id) => ({
        url: `/api/email-template/${id}/toggle-status`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [
        'EmailTemplate',
        { type: 'EmailTemplate', id },
      ],
    }),
    deleteEmailTemplate: builder.mutation({
      query: (id) => ({
        url: `/api/email-template/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['EmailTemplate'],
    }),
  }),
});

export const {
  useGetEmailTemplatesQuery,
  useGetEmailTemplateByIdQuery,
  useCreateEmailTemplateMutation,
  useUpdateEmailTemplateMutation,
  useToggleEmailTemplateStatusMutation,
  useDeleteEmailTemplateMutation,
} = emailTemplateApi;
