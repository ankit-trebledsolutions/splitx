import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// Reports people send from the app (Profile > Help & Support), and what the
// panel does with them: read the queue, open one, change its status or
// priority, answer it, or leave a note other admins see. Nothing deletes: a
// report is closed, and the record stays.
//
// The counts behind the sidebar badge and the dashboard strip come from one
// small endpoint of their own, asked again on a timer by whoever shows them,
// so a report that arrives while the panel is open turns up without a reload.

const reportTag = (id) => ({ type: 'SupportReport', id });

// Everything that changes a report changes what the queue and the counts
// show, so all three are refreshed together.
const touched = (_result, _error, { id }) => [
  reportTag(id),
  reportTag('LIST'),
  'SupportSummary',
];

export const supportApi = createApi({
  reducerPath: 'supportApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['SupportReport', 'SupportSummary'],
  endpoints: (builder) => ({
    getSupportSummary: builder.query({
      query: () => '/support/summary',
      transformResponse: unwrap,
      providesTags: ['SupportSummary'],
    }),
    getSupportReports: builder.query({
      query: ({
        search = '',
        status = '',
        category = '',
        page = 1,
        limit = 10,
      } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const term = search.trim();
        if (term) params.set('search', term);
        if (status) params.set('status', status);
        if (category) params.set('category', category);
        return `/support/reports?${params.toString()}`;
      },
      transformResponse: (response) => {
        const data = unwrap(response);
        return {
          reports: data.reports || [],
          total: data.total ?? 0,
          page: data.page ?? 1,
          pages: data.pages ?? 1,
        };
      },
      providesTags: (result) => [
        reportTag('LIST'),
        ...(result?.reports ?? []).map((report) => reportTag(report._id)),
      ],
    }),
    getSupportReport: builder.query({
      query: (id) => `/support/reports/${id}`,
      transformResponse: (response) => unwrap(response).report,
      providesTags: (_result, _error, id) => [reportTag(id)],
    }),
    // Both name the state rather than toggling it, so a double click cannot
    // flip a report back.
    setSupportReportStatus: builder.mutation({
      query: ({ id, status }) => ({
        url: `/support/reports/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      transformResponse: (response) => unwrap(response).report,
      invalidatesTags: touched,
    }),
    setSupportReportPriority: builder.mutation({
      query: ({ id, priority }) => ({
        url: `/support/reports/${id}/priority`,
        method: 'PATCH',
        body: { priority },
      }),
      transformResponse: (response) => unwrap(response).report,
      invalidatesTags: touched,
    }),
    // `internal` makes it a note between admins. A reply reaches the reporter's
    // phone, and the server moves an open report to In progress on its own.
    addSupportReply: builder.mutation({
      query: ({ id, body, internal = false }) => ({
        url: `/support/reports/${id}/replies`,
        method: 'POST',
        body: { body, internal },
      }),
      transformResponse: (response) => unwrap(response).report,
      invalidatesTags: touched,
    }),
  }),
});

export const {
  useGetSupportSummaryQuery,
  useGetSupportReportsQuery,
  useGetSupportReportQuery,
  useSetSupportReportStatusMutation,
  useSetSupportReportPriorityMutation,
  useAddSupportReplyMutation,
} = supportApi;
