import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Lock, MoreHorizontal, Pencil, RotateCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { ACCESS_LEVEL, hasPermission, PERMISSIONS } from '@/lib/permissions';
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
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import {
  useResetEmailTemplateMutation,
  useSetEmailTemplateActiveMutation,
} from '@/features/email-template/emailTemplateApi';
import {
  selectEmailTemplatePagination,
  selectEmailTemplateSearchTerm,
} from '@/features/email-template/emailTemplateSelectors';
import { setEmailTemplateSearchTerm } from '@/features/email-template/emailTemplateSlice';
import EmailTemplatePagination from './email-template-pagination';
import ResetTemplateDialog from './reset-template-dialog';

const columnHelper = createColumnHelper();

const BASE = '/manage-cms/email-templates';

const EmailTemplateTable = ({ emailTemplates, loading, totalItems }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const searchTerm = useAppSelector(selectEmailTemplateSearchTerm);
  const pagination = useAppSelector(selectEmailTemplatePagination);
  const currentUser = useAppSelector(selectCurrentUser);
  const canEdit = hasPermission(
    currentUser,
    PERMISSIONS.EMAIL_TEMPLATE,
    ACCESS_LEVEL.READ_WRITE,
  );
  const [rowSelection, setRowSelection] = useState({});
  // The row waiting on the reset confirmation, or null when none is.
  const [pendingReset, setPendingReset] = useState(null);
  const [setActive] = useSetEmailTemplateActiveMutation();
  const [resetTemplate, { isLoading: isResetting }] =
    useResetEmailTemplateMutation();

  const handleSetActive = useCallback(
    async (template, isActive) => {
      try {
        await setActive({ key: template.key, isActive }).unwrap();
        toast.success(
          isActive
            ? `“${template.name}” is being sent again`
            : `“${template.name}” is switched off and will not be sent`,
        );
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to update the email'));
      }
    },
    [setActive],
  );

  const confirmReset = useCallback(async () => {
    const template = pendingReset;
    if (!template) return;
    try {
      await resetTemplate({ key: template.key }).unwrap();
      toast.success(`“${template.name}” is back to its original design`);
      setPendingReset(null);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to reset the email'));
    }
  }, [pendingReset, resetTemplate]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <DataGridTableRowSelectAll size="sm" />,
        size: 48,
        enableSorting: false,
        cell: ({ row }) => <DataGridTableRowSelect row={row} size="sm" />,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        size: 280,
        cell: ({ row, getValue }) => (
          <div className="min-w-0 space-y-1">
            <div className="truncate font-semibold">{getValue()}</div>
            <div className="text-sm text-muted-foreground">
              {row.original.description}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('subject', {
        header: 'Subject',
        size: 220,
        cell: ({ getValue }) => (
          <span className="line-clamp-2">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('isCustomized', {
        header: 'Design',
        size: 100,
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge variant="info" appearance="light">
              Edited
            </Badge>
          ) : (
            <Badge variant="secondary" appearance="light">
              Original
            </Badge>
          ),
      }),
      columnHelper.accessor('isActive', {
        header: 'Status',
        size: 130,
        cell: ({ getValue, row }) =>
          row.original.required ? (
            // Sign-up and password reset depend on these, so the server
            // refuses to switch them off. Shown as locked rather than as a
            // switch that answers with an error.
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
                    <Lock className="size-3.5" />
                    Always sent
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  This email carries a code people cannot sign in without.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Switch
              className="data-[state=checked]:bg-blue-500"
              checked={getValue()}
              disabled={!canEdit}
              aria-label={`Send “${row.original.name}”`}
              onCheckedChange={(checked) =>
                handleSetActive(row.original, checked)
              }
            />
          ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 110,
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
            <Button
              onClick={() => navigate(`${BASE}/${row.original.key}`)}
              variant="outline"
              size="icon"
              aria-label="View"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate(`${BASE}/${row.original.key}`)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                {canEdit && (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        navigate(`${BASE}/${row.original.key}/edit`)
                      }
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!row.original.isCustomized}
                      onClick={() => setPendingReset(row.original)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reset to default
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    // canEdit belongs here: the session is restored asynchronously, so on the
    // first render it is false, and without it in the list these columns would
    // keep the menu they were built with.
    [canEdit, handleSetActive, navigate],
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
    getRowId: (row) => row.key,
  });

  return (
    <>
      <ResetTemplateDialog
        template={pendingReset}
        open={Boolean(pendingReset)}
        onOpenChange={(next) => {
          if (!next && !isResetting) setPendingReset(null);
        }}
        onConfirm={confirmReset}
        isResetting={isResetting}
      />
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
    </>
  );
};

export default EmailTemplateTable;
