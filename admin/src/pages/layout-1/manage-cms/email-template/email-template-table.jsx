import { useCallback, useMemo, useState } from 'react';
import {
  Eye,
  MoreHorizontal,
  Search,
  Trash2,
  UserPen,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import {
  CardFooter,
  CardHeader,
  CardTable,
  CardTitle,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  useDeleteEmailTemplateMutation,
  useToggleEmailTemplateStatusMutation,
} from '@/features/email-template/emailTemplateApi';
import {
  selectEmailTemplatePagination,
  selectEmailTemplateSearchTerm,
} from '@/features/email-template/emailTemplateSelectors';
import {
  openCreateTemplateDialog,
  openEditTemplateDialog,
  setEmailTemplateSearchTerm,
} from '@/features/email-template/emailTemplateSlice';
import EmailTemplatePagination from './email-template-pagination';

const columnHelper = createColumnHelper();

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const EmailTemplateTable = ({ emailTemplates, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const searchTerm = useAppSelector(selectEmailTemplateSearchTerm);
  const pagination = useAppSelector(selectEmailTemplatePagination);
  const [rowSelection, setRowSelection] = useState({});
  const [toggleEmailTemplateStatus] = useToggleEmailTemplateStatusMutation();
  const [deleteEmailTemplate] = useDeleteEmailTemplateMutation();

  const handleToggleStatus = useCallback(async (templateId) => {
    try {
      await toggleEmailTemplateStatus(templateId).unwrap();
      toast.success('Template status updated successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update template status'));
      console.error('Error toggling email template status:', error);
    }
  }, [toggleEmailTemplateStatus]);

  const handleDelete = useCallback(async (templateId) => {
    try {
      const data = await deleteEmailTemplate(templateId).unwrap();
      toast.success(data?.message || 'Template deleted successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete template'));
      console.error('Error deleting email template:', error);
    }
  }, [deleteEmailTemplate]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 40,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        size: 200,
      }),
      columnHelper.accessor('service', {
        header: 'Service',
        size: 300,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 80,
        cell: ({ getValue, row }) => (
          <Switch
            className="data-[state=checked]:bg-blue-500"
            checked={getValue()}
            onCheckedChange={() => handleToggleStatus(row.original._id)}
          />
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 justify-center">
            <Button
              onClick={() => navigate(`/email-page/${row.original._id}`)}
              variant="outline"
              size="icon"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate(`/email-page/${row.original._id}`)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => dispatch(openEditTemplateDialog(row.original))}
                >
                  <UserPen className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDelete(row.original._id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [dispatch, handleDelete, handleToggleStatus, navigate],
  );

  const table = useReactTable({
    data: emailTemplates,
    columns,
    state: {
      rowSelection,
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
  });

  return (
    <DataGrid
      table={table}
      recordCount={totalItems}
      isLoading={loading}
      tableLayout={{
        rowBorder: true,
        cellBorder: true,
        width: 'fixed',
      }}
      tableClassNames={{
        base: 'min-w-full',
        edgeCell: 'first:ps-5 last:pe-5',
      }}
      emptyMessage={
        <div className="flex flex-col items-center gap-2 py-6">
          <Search className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No email templates found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search terms
          </p>
        </div>
      }
    >
      <CardHeader className="min-h-0 gap-4 px-5 py-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              Template ({totalItems})
            </CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setEmailTemplateSearchTerm(event.target.value))
                }
                placeholder="Search templates..."
                className="w-full pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => dispatch(openCreateTemplateDialog())}
            >
              Create Template
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <EmailTemplatePagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default EmailTemplateTable;
