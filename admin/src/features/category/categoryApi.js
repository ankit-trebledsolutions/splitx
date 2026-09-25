import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:3000';

export const categoryApi = createApi({
  reducerPath: 'categoryApi',
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['Category'],
  endpoints: (builder) => ({
    getCategories: builder.query({
      query: ({ search = '', parentId = null, page = 1, limit = 5 } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
          params.set('search', trimmedSearch);
        }

        if (parentId) {
          params.set('parentId', parentId);
        }

        return `/api/category?${params.toString()}`;
      },
      providesTags: ['Category'],  // This will help with cache invalidation when categories are modified
    }),
    createCategory: builder.mutation({
      query: (categoryData) => ({
        url: '/api/category',
        method: 'POST',
        body: categoryData,
      }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation({
      query: ({ id, categoryData }) => ({
        url: `/api/category/${id}`,
        method: 'PUT',
        body: categoryData,
      }),
      invalidatesTags: ['Category'],  // Invalidate the 'Category' tag to refetch the category list after an update
    }),
    deleteCategory: builder.mutation({
      query: (id) => ({
        url: `/api/category/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Category'],
    }),
    toggleCategoryStatus: builder.mutation({
      query: (id) => ({
        url: `/api/category/${id}/status`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Category'],
    }),
    reorderCategories: builder.mutation({
      query: (items) => ({
        url: '/api/category/reorder',
        method: 'PATCH',
        body: items,
      }),
      invalidatesTags: ['Category'],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useToggleCategoryStatusMutation,
  useReorderCategoriesMutation,
} = categoryApi;
