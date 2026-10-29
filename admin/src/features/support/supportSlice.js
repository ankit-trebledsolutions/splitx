import { createSlice } from '@reduxjs/toolkit';

// A report opens on a page of its own with its id in the URL, so the only
// state kept here is how the queue is being looked at. Every change of filter
// goes back to the first page: page 4 of "all" is not page 4 of "closed".
const initialState = {
  searchTerm: '',
  // '' is every status; otherwise one of the server's statuses.
  status: '',
  // '' is every category.
  category: '',
  pagination: {
    currentPage: 1,
    pageSize: 10,
  },
};

const supportSlice = createSlice({
  name: 'support',
  initialState,
  reducers: {
    setSupportSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.pagination.currentPage = 1;
    },
    setSupportStatus: (state, action) => {
      state.status = action.payload;
      state.pagination.currentPage = 1;
    },
    setSupportCategory: (state, action) => {
      state.category = action.payload;
      state.pagination.currentPage = 1;
    },
    setSupportPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setSupportCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
  },
});

export const {
  setSupportSearchTerm,
  setSupportStatus,
  setSupportCategory,
  setSupportPageSize,
  setSupportCurrentPage,
} = supportSlice.actions;

export default supportSlice.reducer;
