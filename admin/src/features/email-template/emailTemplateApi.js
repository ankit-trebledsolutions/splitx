import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// The emails Splix sends. There is a fixed set of them — each one exists
// because some part of the API sends it — so there is nothing to create or
// delete here: a template is edited, switched off, or reset to its built-in
// design. They are addressed by what they are (`welcome`), not by an id.

const CONTENT_FIELDS = ['subject', 'preheader', 'body', 'text', 'reason'];

// Only what the server stores, whatever else the form happens to hold.
export const pickContent = (values) =>
  Object.fromEntries(
    CONTENT_FIELDS.map((field) => [field, values?.[field] ?? '']),
  );

const tagsFor = (_result, _error, { key }) => [
  'EmailTemplate',
  { type: 'EmailTemplate', id: key },
];

export const emailTemplateApi = createApi({
  reducerPath: 'emailTemplateApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['EmailTemplate'],
  endpoints: (builder) => ({
    getEmailTemplates: builder.query({
      query: ({ search = '', page = 1, limit = 5 } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const term = search.trim();
        if (term) params.set('search', term);
        return `/email-templates?${params.toString()}`;
      },
      transformResponse: (response) => {
        const data = unwrap(response);
        return {
          templates: data.templates || [],
          total: data.total ?? 0,
          page: data.page ?? 1,
          pages: data.pages ?? 1,
        };
      },
      providesTags: ['EmailTemplate'],
    }),
    getEmailTemplate: builder.query({
      query: (key) => `/email-templates/${key}`,
      transformResponse: (response) => unwrap(response).template,
      providesTags: (_result, _error, key) => [
        { type: 'EmailTemplate', id: key },
      ],
    }),
    // The saved version as it would arrive, filled with sample details. A POST
    // only because the same endpoint also takes a draft; it changes nothing.
    getEmailTemplatePreview: builder.query({
      query: (key) => ({
        url: `/email-templates/${key}/preview`,
        method: 'POST',
        body: {},
      }),
      transformResponse: unwrap,
      providesTags: (_result, _error, key) => [
        { type: 'EmailTemplate', id: key },
      ],
    }),
    // What is in the editor right now, saved or not. A mutation so nothing is
    // cached: every pause in typing asks again with different content.
    previewEmailTemplateDraft: builder.mutation({
      query: ({ key, draft }) => ({
        url: `/email-templates/${key}/preview`,
        method: 'POST',
        body: { draft: pickContent(draft) },
      }),
      transformResponse: unwrap,
    }),
    updateEmailTemplate: builder.mutation({
      query: ({ key, content }) => ({
        url: `/email-templates/${key}`,
        method: 'PUT',
        body: pickContent(content),
      }),
      transformResponse: (response) => unwrap(response).template,
      invalidatesTags: tagsFor,
    }),
    // Names the state rather than toggling it, so a double click cannot switch
    // an email back on.
    setEmailTemplateActive: builder.mutation({
      query: ({ key, isActive }) => ({
        url: `/email-templates/${key}/active`,
        method: 'PATCH',
        body: { isActive },
      }),
      invalidatesTags: tagsFor,
    }),
    resetEmailTemplate: builder.mutation({
      query: ({ key }) => ({
        url: `/email-templates/${key}/reset`,
        method: 'POST',
      }),
      transformResponse: (response) => unwrap(response).template,
      invalidatesTags: tagsFor,
    }),
    // Always goes to the signed-in admin's own address; the server decides
    // that, not this request.
    sendTestEmail: builder.mutation({
      query: ({ key, draft }) => ({
        url: `/email-templates/${key}/test`,
        method: 'POST',
        body: draft ? { draft: pickContent(draft) } : {},
      }),
      transformResponse: unwrap,
    }),
  }),
});

export const {
  useGetEmailTemplatesQuery,
  useGetEmailTemplateQuery,
  useGetEmailTemplatePreviewQuery,
  usePreviewEmailTemplateDraftMutation,
  useUpdateEmailTemplateMutation,
  useSetEmailTemplateActiveMutation,
  useResetEmailTemplateMutation,
  useSendTestEmailMutation,
} = emailTemplateApi;
