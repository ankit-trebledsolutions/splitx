import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { DataGridProvider } from '@/components/ui/data-grid';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { selectEmailTemplatePagination } from '@/features/email-template/emailTemplateSelectors';
import {
  setEmailTemplateCurrentPage,
  setEmailTemplatePageSize,
} from '@/features/email-template/emailTemplateSlice';

const EmailTemplatePagination = ({ totalItems }) => {
  const dispatch = useAppDispatch();
  const pagination = useAppSelector(selectEmailTemplatePagination);
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
      dispatch(setEmailTemplatePageSize(newPageSize));
    },
    setPageIndex: (newPageIndex) => {
      dispatch(setEmailTemplateCurrentPage(newPageIndex + 1));
    },
    previousPage: () => {
      if (pagination.currentPage > 1) {
        dispatch(setEmailTemplateCurrentPage(pagination.currentPage - 1));
      }
    },
    nextPage: () => {
      if (pagination.currentPage < totalPages) {
        dispatch(setEmailTemplateCurrentPage(pagination.currentPage + 1));
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

export default EmailTemplatePagination;
