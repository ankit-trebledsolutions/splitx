import { useEffect, useMemo, useState, memo } from 'react';
import { useSetCoAdminPermissionsMutation } from '@/features/co-admins/coAdminsApi';
import { useGetModulesQuery } from '@/features/auth/authApi';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
import {
  CardHeader,
  CardTable,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const columnHelper = createColumnHelper();

const getPermissionValue = (permissions, moduleName) => {
  const value = permissions?.[moduleName];

  if (value === 'rea_write') {
    return 'read_write';
  }

  if (value === 'none' || value === 'read' || value === 'read_write') {
    return value;
  }

  return 'none';
};

const CoAdminsPermissionsTable = ({ admin }) => {
  // The server owns the module list, so a module added in
  // backend/src/config/permissions.js appears here with no frontend change.
  const { data: moduleData } = useGetModulesQuery();
  const allPermissions = useMemo(
    () => (moduleData?.modules || []).map((name) => ({ id: name, permission: name })),
    [moduleData],
  );
  const [rowSelection, setRowSelection] = useState({});
  const [selectedPermissions, setSelectedPermissions] = useState({});
  const [setAdminPermissions, { isLoading: isUpdating }] = useSetCoAdminPermissionsMutation();

  useEffect(() => {
    setSelectedPermissions(admin?.permissions || {});
  }, [admin]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 56,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.accessor('permission', {
        header: 'Module',
        size: 200,
      }),
      columnHelper.accessor('permission', {
        header: 'Permission',
        size: 220,
        cell: ({ row }) => {
          const moduleName = row.original.permission;

          return (
            <Select
              onValueChange={(value) =>{
                setSelectedPermissions((currentPermissions) => ({
                  ...currentPermissions,
                  [moduleName]: value,
                }))
              }}
              value={getPermissionValue(selectedPermissions, moduleName)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select permission" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="read">Read Only</SelectItem>
                <SelectItem value="read_write">Read/Write</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      }),
    ],
    [selectedPermissions],
  );

  const table = useReactTable({
    data: allPermissions,
    columns,
    state: {
      rowSelection,
    },
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
  });

  const handleSavePermissions = async () => {
    try {
      await setAdminPermissions({
        id: admin?.id,
        permissions: selectedPermissions,
      }).unwrap();
      toast.success("permission updated successfully");
    } catch (error) {
      console.error('Failed to update permissions:', error);
      toast.error("error while updating");
    }
  };

  return (
    <DataGrid
      table={table}
      recordCount={allPermissions.length}
      isLoading={false}
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
          <p className="text-muted-foreground">No permissions found</p>
        </div>
      }
    >
      <CardHeader className="min-h-0 gap-4 px-5 py-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold">
              Permissions ({allPermissions.length})
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="justify-end">
          <Button
            type="submit"
            onClick={handleSavePermissions}
            disabled={isUpdating}
          >
            {isUpdating ? 'Saving Changes...' : 'Save Changes'}
          </Button>
      </CardFooter>
    </DataGrid>
  );
};

export default memo(CoAdminsPermissionsTable);
