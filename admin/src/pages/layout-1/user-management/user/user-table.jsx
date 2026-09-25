import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Eye,
  MoreHorizontal,
  Search,
  Trash2,
  UserCheck,
  UserPen,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  useDeleteUserMutation,
  useSetUserActiveMutation,
} from '@/features/users/usersApi';
import { useGetCoAdminsQuery } from '@/features/co-admins/coAdminsApi';
import {
  selectUserPagination,
  selectUserSearchTerm,
} from '@/features/users/usersSelectors';
import {
  openCreateUserDialog,
  openEditUserDialog,
  openViewUserDialog,
  setUserSearchTerm,
} from '@/features/users/usersSlice';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { hasPermission, ACCESS_LEVEL, PERMISSIONS } from '@/lib/permissions';
import UserPagination from './user-pagination';

const columnHelper = createColumnHelper();

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const formatTableDate = (value) => {
  if (!value || value === 'N/A') return 'N/A';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

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

const getRoleBadge = (role) => {
  switch (role) {
    case 'admin':
      return 'info';
    case 'moderator':
      return 'default';
    default:
      return 'secondary';
  }
};

const UserTable = ({ users, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectUserSearchTerm);
  const pagination = useAppSelector(selectUserPagination);
  const currentUser = useAppSelector(selectCurrentUser);
  const canCreateUser = hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT, ACCESS_LEVEL.READ_WRITE);
  const [rowSelection, setRowSelection] = useState({});
  const [setUserActive] = useSetUserActiveMutation();
  const [deleteUser] = useDeleteUserMutation();
  
  // Refetch co-admins when admin users are modified
  const { refetch: refetchCoAdmins } = useGetCoAdminsQuery({
    search: '',
    page: 1,
    limit: 5,
  });

  const handleToggleBlock = useCallback(async (user) => {
    try {
      await setUserActive({ id: user.id, isActive: !user.isActive }).unwrap();
      toast.success(
        `${user.name || 'User'} ${user.isActive ? 'suspended' : 'restored'} successfully`,
      );
      
      // Refetch co-admins if admin is blocked/unblocked
      if (user.role === 'admin') {
        await refetchCoAdmins();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user status'));
      console.error('Failed to toggle user block status:', error);
    }
  }, [setUserActive, refetchCoAdmins]);

  const handleDelete = useCallback(async (user) => {
    try {
      await deleteUser(user.id).unwrap();
      toast.success(`${user.name || 'User'} deleted successfully`);
      
      // Refetch co-admins if admin is deleted
      if (user.role === 'admin') {
        await refetchCoAdmins();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete user'));
      console.error('Failed while deleting the user:', error);
    }
  }, [deleteUser, refetchCoAdmins]);

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
        header: 'User',
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
      columnHelper.accessor('role', {
        header: 'Role',
        size: 130,
        cell: ({ getValue }) => (
          <Badge variant={getRoleBadge(getValue())}>{getValue()}</Badge>
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
      columnHelper.accessor('joinDate', {
        header: 'Join Date',
        size: 160,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatTableDate(getValue())}</span>
        ),
      }),
      columnHelper.accessor('lastLogin', {
        header: 'Last Login',
        size: 160,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatTableDate(getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 120,
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <Button
              variant="outline"
              size="icon"
              onClick={() => dispatch(openViewUserDialog(row.original))}
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
                  onClick={() => dispatch(openViewUserDialog(row.original))}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                {canCreateUser && (
                  <>
                    <DropdownMenuItem
                      onClick={() => dispatch(openEditUserDialog(row.original))}
                    >
                      <UserPen className="mr-2 h-4 w-4" />
                      Edit User
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleToggleBlock(row.original)}
                      className={
                        !row.original.isActive ? 'text-green-600' : 'text-red-600'
                      }
                    >
                      {!row.original.isActive ? (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Unblock User
                        </>
                      ) : (
                        <>
                          <UserX className="mr-2 h-4 w-4" />
                          Block User
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDelete(row.original)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete User
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [dispatch, handleDelete, handleToggleBlock],
  );

  const table = useReactTable({
    data: users,
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
          <p className="text-muted-foreground">No users found</p>
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
              Users ({totalItems})
            </CardTitle>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setUserSearchTerm(event.target.value))
                }
                placeholder="Search users..."
                className="w-full pl-9"
              />
            </div>
            <Button
              variant="outline"
              disabled={!canCreateUser}
              onClick={() => dispatch(openCreateUserDialog())}
            >
              Create Resource
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <UserPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default UserTable;
