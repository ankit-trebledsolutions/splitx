import { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Eye, Inbox, MessageSquare, Paperclip, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { timeAgo } from '@/lib/helpers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CardFooter,
  CardHeader,
  CardTable,
  CardTitle,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  CATEGORIES,
  STATUSES,
  categoryOf,
  formatWhen,
  priorityOf,
  reporterOf,
  statusOf,
} from '@/features/support/supportLabels';
import {
  selectSupportCategory,
  selectSupportPagination,
  selectSupportSearchTerm,
  selectSupportStatus,
} from '@/features/support/supportSelectors';
import {
  setSupportCategory,
  setSupportSearchTerm,
  setSupportStatus,
} from '@/features/support/supportSlice';
import SupportPagination from './support-pagination';

const columnHelper = createColumnHelper();

const BASE = '/support';

// Radix selects cannot hold an empty string, so "every category" has a value
// of its own that is turned back into '' for the slice.
const EVERY_CATEGORY = 'all';

const SupportTable = ({ reports, totalItems, summary, loading }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const searchTerm = useAppSelector(selectSupportSearchTerm);
  const status = useAppSelector(selectSupportStatus);
  const category = useAppSelector(selectSupportCategory);
  const pagination = useAppSelector(selectSupportPagination);

  const columns = useMemo(
    () => [
      columnHelper.accessor('category', {
        header: 'Kind',
        size: 150,
        cell: ({ getValue }) => (
          <Badge variant="secondary" appearance="light">
            {categoryOf(getValue()).label}
          </Badge>
        ),
      }),
      columnHelper.accessor('subject', {
        header: 'Report',
        size: 340,
        cell: ({ row, getValue }) => {
          const reporter = reporterOf(row.original);
          const screenshots = row.original.attachments?.length ?? 0;
          return (
            <div className="min-w-0 space-y-1">
              <Link
                to={`${BASE}/${row.original._id}`}
                className="block truncate font-semibold hover:text-primary"
              >
                {getValue()}
              </Link>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  {reporter.name}
                  {reporter.email ? ` · ${reporter.email}` : ''}
                </span>
                {screenshots > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5"
                    title={`${screenshots} screenshot${screenshots === 1 ? '' : 's'}`}
                  >
                    <Paperclip className="size-3.5" />
                    {screenshots}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 120,
        cell: ({ getValue }) => {
          const look = statusOf(getValue());
          return (
            <Badge variant={look.variant} appearance="light">
              {look.label}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        size: 100,
        cell: ({ getValue }) => {
          const look = priorityOf(getValue());
          return look.key === 'normal' ? (
            <span className="text-sm text-muted-foreground">{look.label}</span>
          ) : (
            <Badge variant={look.variant} appearance="light">
              {look.label}
            </Badge>
          );
        },
      }),
      columnHelper.accessor('replies', {
        header: 'Replies',
        size: 90,
        cell: ({ getValue, row }) => (
          <span
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            title={
              row.original.notes
                ? `${row.original.notes} internal note${row.original.notes === 1 ? '' : 's'}`
                : undefined
            }
          >
            <MessageSquare className="size-3.5" />
            {getValue() ?? 0}
            {row.original.notes ? (
              <span className="text-xs">(+{row.original.notes})</span>
            ) : null}
          </span>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Sent',
        size: 150,
        cell: ({ getValue }) => (
          <div className="space-y-0.5 whitespace-nowrap">
            <div className="text-sm">{timeAgo(getValue())}</div>
            <div className="text-xs text-muted-foreground">
              {formatWhen(getValue())}
            </div>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <Button
              onClick={() => navigate(`${BASE}/${row.original._id}`)}
              variant="outline"
              size="icon"
              aria-label="Open report"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [navigate],
  );

  const table = useReactTable({
    data: reports,
    columns,
    state: {
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row._id,
  });

  // The count on a tab is of that status across the whole queue, whatever
  // the search and category say: it answers "how much is waiting", and the
  // filtered total is in the title beside it.
  const countFor = (key) => summary?.[key];
  const total = summary?.total;

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
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchTerm || status || category
              ? 'No reports match these filters'
              : 'Nobody has sent a report yet'}
          </p>
          {(searchTerm || status || category) && (
            <p className="text-sm text-muted-foreground">
              Try another status, kind or search
            </p>
          )}
        </div>
      }
    >
      <CardHeader className="min-h-0 flex-col items-stretch gap-4 px-5 py-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold">
            Reports ({totalItems})
          </CardTitle>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Select
              value={category || EVERY_CATEGORY}
              onValueChange={(value) =>
                dispatch(
                  setSupportCategory(value === EVERY_CATEGORY ? '' : value),
                )
              }
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Kind">
                <SelectValue placeholder="Every kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY_CATEGORY}>Every kind</SelectItem>
                {CATEGORIES.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) =>
                  dispatch(setSupportSearchTerm(event.target.value))
                }
                placeholder="Search title or reporter..."
                className="w-full pl-9"
              />
            </div>
          </div>
        </div>

        <Tabs
          value={status || 'all'}
          onValueChange={(value) =>
            dispatch(setSupportStatus(value === 'all' ? '' : value))
          }
        >
          <TabsList variant="line" size="sm" className="w-full overflow-x-auto">
            <TabsTrigger value="all">
              All
              {total !== undefined && (
                <span className="text-muted-foreground">{total}</span>
              )}
            </TabsTrigger>
            {STATUSES.map((entry) => (
              <TabsTrigger key={entry.key} value={entry.key}>
                {entry.label}
                {countFor(entry.key) !== undefined && (
                  <span className="text-muted-foreground">
                    {countFor(entry.key)}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <SupportPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default SupportTable;
