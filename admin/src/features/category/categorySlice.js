import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  parentId: null,
  breadcrumbPath: [{ name: 'Categories', id: null }],
  selectedCategory: null,
  dialogType: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
  },
};

const categorySlice = createSlice({
  name: 'category',
  initialState,
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    openCreateDialog: (state) => {
      state.selectedCategory = null;
      state.dialogType = 'create';
    },
    openEditDialog: (state, action) => {
      state.selectedCategory = action.payload;
      state.dialogType = 'edit';
    },
    closeDialog: (state) => {
      state.selectedCategory = null;
      state.dialogType = null;
    },
    openSubCategory: (state, action) => {
      const { id, name } = action.payload;

      state.searchTerm = '';
      state.parentId = id;
      state.pagination.currentPage = 1;
      state.breadcrumbPath.push({ id, name });
    },
    navigateToBreadcrumb: (state, action) => {
      const { id, index } = action.payload;

      state.searchTerm = '';
      state.parentId = id;
      state.pagination.currentPage = 1;
      state.breadcrumbPath = state.breadcrumbPath.slice(0, index + 1);
    },
  },
});

export const {
  setSearchTerm,
  setPageSize,
  setCurrentPage,
  openCreateDialog,
  openEditDialog,
  closeDialog,
  openSubCategory,
  navigateToBreadcrumb,
} = categorySlice.actions;

export default categorySlice.reducer;
