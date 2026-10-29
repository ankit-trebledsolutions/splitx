import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { DataGridProvider } from '@/components/ui/data-grid';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { selectWalletPagination } from '@/features/wallet/walletSelectors';
import {
  setWalletCurrentPage,
  setWalletPageSize,
} from '@/features/wallet/walletSlice';

// The grid's own pagination control, driven by the slice rather than by a
// table instance: the server does the paging, so the table only ever holds
// one page. The same arrangement as Support's.
const WalletPagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectWalletPagination);
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const mockTable = {
    getState: () => ({
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    }),
    getPageCount: () => totalPages,
    setPageSize: (newPageSize) => {
      dispatch(setWalletPageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setWalletCurrentPage(newPageIndex + 1));
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setWalletCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setWalletCurrentPage(pagination.currentPage + 1));
      }
    },
    getCanPreviousPage: () => pagination.currentPage > 1,
    getCanNextPage: () => pagination.currentPage < totalPages,
  };

  return (
    <DataGridProvider
      table={mockTable}
      recordCount={totalItems}
      isLoading={false}
    >
      <DataGridPagination
        sizes={[10, 25, 50, 100]}
        info="{from} - {to} of {count}"
      />
    </DataGridProvider>
  );
};

export default WalletPagination;
