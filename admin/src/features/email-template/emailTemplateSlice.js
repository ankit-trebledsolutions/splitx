import { createSlice } from '@reduxjs/toolkit';

// Editing and viewing are pages of their own with the template in the URL, so
// the only state kept here is how the list is being looked at.
const initialState = {
  searchTerm: '',
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
  },
});

export const {
  setEmailTemplateSearchTerm,
  setEmailTemplatePageSize,
  setEmailTemplateCurrentPage,
} = emailTemplateSlice.actions;

export default emailTemplateSlice.reducer;
