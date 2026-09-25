import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { DataGridProvider } from '@/components/ui/data-grid';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { selectUserPagination } from '@/features/users/usersSelectors';
import {
  setUserCurrentPage,
  setUserPageSize,
} from '@/features/users/usersSlice';

const UserPagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectUserPagination);
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
      dispatch(setUserPageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setUserCurrentPage(newPageIndex + 1));
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setUserCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setUserCurrentPage(pagination.currentPage + 1));
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

export default UserPagination;
