import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';
import { listQuery, transformList, transformUser } from '@/features/users/usersApi';

// Staff accounts — `admin` and `super_admin`. The same collection and the same
// endpoint as app users, narrowed with role=staff, so there is one set of rules
// on the server instead of two that can drift apart.

export const coAdminsApi = createApi({
  reducerPath: 'coAdminsApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['CoAdmin', 'User'],
  endpoints: (builder) => ({
    getCoAdmins: builder.query({
      query: listQuery('staff'),
      transformResponse: (response) => {
        const { users, ...rest } = transformList(response);
        return { admins: users, ...rest };
      },
      providesTags: ['CoAdmin'],
    }),
    // Super-admin only on the server: a co-admin with write access manages app
    // users but cannot mint new administrators.
    createCoAdmin: builder.mutation({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['CoAdmin', 'User'],
    }),
    updateCoAdmin: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CoAdmin', 'User'],
    }),
    deleteCoAdmin: builder.mutation({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CoAdmin', 'User'],
    }),
    // Kept apart from updateCoAdmin because the matrix saves on its own and
    // must not be able to change a role or a password as a side effect.
    setCoAdminPermissions: builder.mutation({
      query: ({ id, permissions }) => ({
        url: `/users/${id}/permissions`,
        method: 'PUT',
        body: { permissions },
      }),
      transformResponse: (response) => transformUser(unwrap(response).user),
      invalidatesTags: ['CoAdmin'],
    }),
  }),
});

export const {
  useGetCoAdminsQuery,
  useCreateCoAdminMutation,
  useUpdateCoAdminMutation,
  useDeleteCoAdminMutation,
  useSetCoAdminPermissionsMutation,
} = coAdminsApi;
