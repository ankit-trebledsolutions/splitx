import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  selectedTemplate: null,
  dialogType: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
  },
};

const emailTemplateSlice = createSlice({
  name: 'emailTemplate',
  initialState,
  reducers: {
    setEmailTemplateSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setEmailTemplatePageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setEmailTemplateCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    openCreateTemplateDialog: (state) => {
      state.selectedTemplate = null;
      state.dialogType = 'create';
    },
    openEditTemplateDialog: (state, action) => {
      state.selectedTemplate = action.payload;
      state.dialogType = 'edit';
    },
    closeTemplateDialog: (state) => {
      state.selectedTemplate = null;
      state.dialogType = null;
    },
  },
});

export const {
  setEmailTemplateSearchTerm,
  setEmailTemplatePageSize,
  setEmailTemplateCurrentPage,
  openCreateTemplateDialog,
  openEditTemplateDialog,
  closeTemplateDialog,
} = emailTemplateSlice.actions;

export default emailTemplateSlice.reducer;
