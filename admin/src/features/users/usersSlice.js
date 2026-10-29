import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  selectedUser: null,
  dialogType: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
  },
};

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setUserSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setUserPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setUserCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    openCreateUserDialog: (state) => {
      state.selectedUser = null;
      state.dialogType = 'create';
    },
    openEditUserDialog: (state, action) => {
      state.selectedUser = action.payload;
      state.dialogType = 'edit';
    },
    openViewUserDialog: (state, action) => {
      state.selectedUser = action.payload;
      state.dialogType = 'view';
    },
    closeUserDialog: (state) => {
      state.selectedUser = null;
      state.dialogType = null;
    },
  },
});

export const {
  setUserSearchTerm,
  setUserPageSize,
  setUserCurrentPage,
  openCreateUserDialog,
  openEditUserDialog,
  openViewUserDialog,
  closeUserDialog,
} = usersSlice.actions;

export default usersSlice.reducer;
