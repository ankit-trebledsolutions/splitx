import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:3000';
export const imageCarouselApi = createApi({
  reducerPath: 'imageCarouselApi',
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['Carousel', 'CarouselImage'],
  endpoints: (builder) => ({
    getCarousels: builder.query({
      query: ({ search = '', page = 1, limit = 5 } = {}) => {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const trimmedSearch = search.trim();
        if (trimmedSearch) {
          params.set('search', trimmedSearch);
        }
        return `/api/carousel?${params.toString()}`;
      },
      providesTags: ['Carousel'],
    }),
    getCarouselImages: builder.query({
      query: (id) => `/api/carousel-image/${id}`,
      providesTags: (_result, _error, id) => [
        'CarouselImage',
        { type: 'CarouselImage', id },
      ],
    }),
    createCarousel: builder.mutation({
      query: (imageData) => ({
        url: '/api/carousel',
        method: 'POST',
        body: imageData,
      }),
      invalidatesTags: ['Carousel'],
    }),
    updateCarousel: builder.mutation({
      query: ({ id, imageData }) => ({
        url: `/api/carousel/${id}`,
        method: 'PUT',
        body: imageData,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        'Carousel',
        { type: 'Carousel', id },
      ],
    }),
    deleteCarousel: builder.mutation({
      query: (id) => ({
        url: `/api/carousel/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        'Carousel',
        { type: 'Carousel', id },
      ],
    }),
    toggleCarouselStatus: builder.mutation({
      query: (id) => ({
        url: `/api/carousel/${id}/toggle-status`,
        method: 'PATCH',
      }),
      invalidatesTags: (_result, _error, id) => [
        'Carousel',
        { type: 'Carousel', id },
      ],
    }),
    createCarouselImage: builder.mutation({
      query: (imageData) => ({
        url: '/api/carousel-image',
        method: 'POST',
        body: imageData,
      }),
      invalidatesTags: (_result, _error, imageData) => {
        const carouselId = imageData?.get?.('carouselId');
        return [
          'Carousel',
          'CarouselImage',
          ...(carouselId ? [{ type: 'CarouselImage', id: carouselId }] : []),
        ];
      },
    }),
    reorderCarouselImages: builder.mutation({
      query: (items) => ({
        url: '/api/carousel-image/reorder',
        method: 'PUT',
        body: { items },
      }),
      invalidatesTags: ['CarouselImage'],
    }),
    updateCarouselImage: builder.mutation({
      query: ({ id, imageData }) => ({
        url: `/api/carousel-image/${id}`,
        method: 'PUT',
        body: imageData,
      }),
      invalidatesTags: ['CarouselImage'],
    }),
    deleteCarouselImage: builder.mutation({
      query: (id) => ({
        url: `/api/carousel-image/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Carousel', 'CarouselImage'],
    }),
  }),
});

export const {
  useGetCarouselsQuery,
  useGetCarouselImagesQuery,
  useCreateCarouselMutation,
  useUpdateCarouselMutation,
  useDeleteCarouselMutation,
  useToggleCarouselStatusMutation,
  useCreateCarouselImageMutation,
  useReorderCarouselImagesMutation,
  useUpdateCarouselImageMutation,
  useDeleteCarouselImageMutation,
} = imageCarouselApi;
