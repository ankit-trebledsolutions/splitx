import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { DataGridProvider } from '@/components/ui/data-grid';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCarouselPagination } from '@/features/image-carousel/imageCarouselSelectors';
import {
  setCarouselCurrentPage,
  setCarouselPageSize,
} from '@/features/image-carousel/imageCarouselSlice';

const CarouselPagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectCarouselPagination);
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
      dispatch(setCarouselPageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setCarouselCurrentPage(newPageIndex + 1)); // Convert back to 1-based indexing
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setCarouselCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setCarouselCurrentPage(pagination.currentPage + 1));
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

export default CarouselPagination
