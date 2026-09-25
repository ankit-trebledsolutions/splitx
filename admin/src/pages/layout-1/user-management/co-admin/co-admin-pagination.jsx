import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { DataGridProvider } from '@/components/ui/data-grid';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { selectAdminPagination } from '@/features/co-admins/coAdminsSelectors';
import {
  setAdminCurrentPage,
  setAdminPageSize,
} from '@/features/co-admins/coAdminsSlice';

const AdminPagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectAdminPagination);
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
      dispatch(setAdminPageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setAdminCurrentPage(newPageIndex + 1));
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setAdminCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setAdminCurrentPage(pagination.currentPage + 1));
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
        sizes={[5, 10, 50, 100]}
        info="{from} - {to} of {count}"
      />
    </DataGridProvider>
  );
};

export default AdminPagination;
