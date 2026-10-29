import { createSlice } from '@reduxjs/toolkit';

// How the activity list on the Wallet page is being looked at, kept here so
// it survives a trip to another page and back. Every change of filter goes
// back to the first page: page 4 of everything is not page 4 of grants.
const initialState = {
  // '' is every type; otherwise one of the server's types.
  type: '',
  // '' is every feature.
  feature: '',
  pagination: {
    currentPage: 1,
    pageSize: 10,
  },
};

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setWalletType: (state, action) => {
      state.type = action.payload;
      state.pagination.currentPage = 1;
    },
    setWalletFeature: (state, action) => {
      state.feature = action.payload;
      state.pagination.currentPage = 1;
    },
    setWalletPageSize: (state, action) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    setWalletCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
  },
});

export const {
  setWalletType,
  setWalletFeature,
  setWalletPageSize,
  setWalletCurrentPage,
} = walletSlice.actions;

export default walletSlice.reducer;
