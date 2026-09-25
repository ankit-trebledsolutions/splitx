import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  selectedAdmin: null,
  activePermission: null,
  dialogType: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
  },
};

const adminsSlice = createSlice({
  name: 'admins',
  initialState,
  reducers: {
    setAdminSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setAdminPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setAdminCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    // openEditAdminDialog: (state, action) => {
    //   state.selectedAdmin = action.payload;
    //   state.dialogType = 'edit';
    // },
    // openViewAdminDialog: (state, action) => {
    //   state.selectedAdmin = action.payload;
    //   state.dialogType = 'view';
    // },
    closeAdminDialog: (state) => {
      state.selectedAdmin = null;
      state.activePermission = null;
      state.dialogType = null;
    },
    openPermissions: (state, action) => {
      console.log(action.payload)
      state.activePermission = action.payload;
    },
    openPermissionsDialog: (state, action) => {
      console.log(action.payload)
      state.selectedAdmin = action.payload;
      state.dialogType = 'viewPermissions';
    },
    closePermissionsDialog: (state) => {
      state.selectedAdmin = null;
      state.activePermission = null;
      state.dialogType = null;
    }
  },
});

export const {
  setAdminSearchTerm,
  setAdminPageSize,
  setAdminCurrentPage,
  // openEditAdminDialog,
  // openViewAdminDialog,
  closeAdminDialog,
  openPermissions,
  openPermissionsDialog,
  closePermissionsDialog,
} = adminsSlice.actions;

export default adminsSlice.reducer;
