import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  selectedCarousel: null,
  selectedCarouselImage: null,
  activeCarousel: null,
  dialogType: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
  },
};

const imageCarouselSlice = createSlice({
  name: 'imageCarousel',
  initialState,
  reducers: {
    setCarouselSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setCarouselPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setCarouselCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    openCreateCarouselDialog: (state) => {
      state.selectedCarousel = null;
      state.dialogType = 'create';
    },
    openEditCarouselDialog: (state, action) => {
      state.selectedCarousel = action.payload;
      state.dialogType = 'edit';
    },
    openCreateCarouselImageDialog: (state) => {
      state.selectedCarouselImage = null;
      state.dialogType = 'createImage';
    },
    openEditCarouselImageDialog: (state, action) => {
      state.selectedCarouselImage = action.payload;
      state.dialogType = 'editImage';
    },
    openCarouselImages: (state, action) => {
      state.activeCarousel = action.payload;
    },
    closeCarouselImages: (state) => {
      state.activeCarousel = null;
    },
    closeCarouselDialog: (state) => {
      state.selectedCarousel = null;
      state.selectedCarouselImage = null;
      state.dialogType = null;
    },
  },
});

export const {
  setCarouselSearchTerm,
  setCarouselPageSize,
  setCarouselCurrentPage,
  openCreateCarouselDialog,
  openEditCarouselDialog,
  openCreateCarouselImageDialog,
  openEditCarouselImageDialog,
  openCarouselImages,
  closeCarouselImages,
  closeCarouselDialog,
} = imageCarouselSlice.actions;

export default imageCarouselSlice.reducer;
