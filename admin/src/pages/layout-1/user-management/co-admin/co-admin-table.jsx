import { useCallback, useMemo, useState } from 'react';
import {
  selectAdminPagination,
  selectAdminSearchTerm,
} from '@/features/co-admins/coAdminsSelectors';
import {
  openPermissions,
  setAdminSearchTerm,
} from '@/features/co-admins/coAdminsSlice';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Search, UserLock, UserPen } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import AdminPagination from './co-admin-pagination';
import { openPermissionsDialog } from '@/features/co-admins/coAdminsSlice';


const columnHelper = createColumnHelper();

const getStatusBadge = (status, isBlocked) => {
  if (isBlocked) return 'destructive';
  switch (status) {
    case 'active':
      return 'default';
    case 'inactive':
      return 'secondary';
    case 'blocked':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const CoAdminTable = ({ admins, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectAdminSearchTerm);
  const pagination = useAppSelector(selectAdminPagination);
  const [rowSelection, setRowSelection] = useState({});
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 56,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.accessor('name', {
        header: 'Admin',
        size: 320,
        cell: ({ row, getValue }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={row.original.avatar} alt={getValue()} />
              <AvatarFallback>
                {getValue()
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="truncate font-semibold">{getValue()}</div>
              <div className="truncate text-sm text-muted-foreground">
                {row.original.email}
              </div>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 130,
        cell: ({ row, getValue }) => (
          <Badge variant={getStatusBadge(getValue(), !row.original.isActive)}>
            {!row.original.isActive ? 'Blocked' : getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor('permission', {
        header: 'Permission',
        size: 120,
        cell: ({ row }) => {
          const permissionCount = Object.entries(
            row.original.permissions || {}
          ).filter(([_, value]) => value !== 'none').length;

          return (
            <div className="flex flex-wrap gap-2">
              <Badge
                onClick={() => dispatch(openPermissionsDialog(row.original))}
                shape="circle"
                appearance="outline"
                variant={permissionCount > 0 ? 'primary' : 'secondary'}
                className={`${
                  permissionCount > 0
                    ? 'cursor-pointer'
                    : ''
                }`}
              >
                {permissionCount} Permissions
              </Badge>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 120,
        cell: ({ row }) => (
            <Button
              variant="outline"
              size="icon"
              onClick={() => dispatch(openPermissions(row.original))}
            >
              <UserLock className="h-4 w-4" />
            </Button>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: admins,
    columns,
    state: {
      rowSelection,
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    },
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
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
          <p className="text-muted-foreground">No Admins found</p>
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
              Admins ({totalItems})
            </CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setAdminSearchTerm(event.target.value))
                }
                placeholder="Search admins..."
                className="w-full pl-9"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <AdminPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default CoAdminTable;
