import { createApi } from '@reduxjs/toolkit/query/react';
import { adminBaseQuery, unwrap } from '@/lib/api';

// SplitX app users. Staff accounts live in the same collection and are fetched
// through the same endpoint with `role=staff` — see coAdminsApi.

// Shapes a SplitX user document for the table. Two things it deliberately does
// not do: invent an avatar (the previous version picked a random one on every
// fetch, so faces flickered between renders) and carry an `isBlocked` flag
// (`isActive` is the single source of truth, on the server too).
export const transformUser = (user) => ({
  id: user._id || user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar || null,
  isActive: user.isActive !== false,
  status: user.isActive !== false ? 'active' : 'suspended',
  emailVerified: user.emailVerified !== false,
  joinDate: user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : null,
  lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().split('T')[0] : null,
  // Mongoose Maps arrive as plain objects once serialised.
  permissions: user.permissions || {},
});

const listQuery =
  (role) =>
  ({ search = '', page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (role) params.set('role', role);
    const term = search.trim();
    // Searching is a query parameter now, not a path segment: a name with a
    // slash or a dot in it used to produce a 404 or a broken route.
    if (term) params.set('search', term);
    return `/users?${params.toString()}`;
  };

const transformList = (response) => {
  const data = unwrap(response);
  return {
    users: (data.users || []).map(transformUser),
    total: data.total ?? 0,
    page: data.page ?? 1,
    pages: data.pages ?? 1,
  };
};

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: adminBaseQuery,
  tagTypes: ['User', 'CoAdmin'],
  endpoints: (builder) => ({
    getUsers: builder.query({
      query: listQuery('user'),
      transformResponse: transformList,
      providesTags: ['User'],
    }),
    getUser: builder.query({
      query: (id) => `/users/${id}`,
      transformResponse: (response) => transformUser(unwrap(response).user),
      providesTags: ['User'],
    }),
    // Any role. The server refuses to create an ADMIN unless the caller is a
    // super admin, so the guard lives there rather than in this form.
    createUser: builder.mutation({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User', 'CoAdmin'],
    }),
    updateUser: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['User', 'CoAdmin'],
    }),
    // Names the state rather than toggling it, so a double-click cannot undo
    // the suspension it just applied.
    setUserActive: builder.mutation({
      query: ({ id, isActive }) => ({
        url: `/users/${id}/active`,
        method: 'PATCH',
        body: { isActive },
      }),
      invalidatesTags: ['User', 'CoAdmin'],
    }),
    deleteUser: builder.mutation({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['User', 'CoAdmin'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useCreateUserMutation,
  useGetUserQuery,
  useUpdateUserMutation,
  useSetUserActiveMutation,
  useDeleteUserMutation,
} = usersApi;

export { listQuery, transformList };
