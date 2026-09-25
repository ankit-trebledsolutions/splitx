import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { DataGridProvider } from '@/components/ui/data-grid';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCategoryPagination } from '@/features/category/categorySelectors';
import {
  setCurrentPage,
  setPageSize,
} from '@/features/category/categorySlice';

const CategoryPagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectCategoryPagination);
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const mockTable = {
    getState: () => ({
      pagination: {
        pageIndex: pagination.currentPage - 1, // TanStack Table uses 0-based indexing
        pageSize: pagination.pageSize,
      },
    }),
    getPageCount: () => totalPages,
    setPageSize: (newPageSize) => {
      dispatch(setPageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setCurrentPage(newPageIndex + 1)); // Convert back to 1-based indexing
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setCurrentPage(pagination.currentPage + 1));
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
  )
}

export default CategoryPagination
