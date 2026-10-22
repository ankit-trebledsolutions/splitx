import { useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '@/lib/helpers';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import {
  CardFooter,
  CardHeader,
  CardTable,
  CardTitle,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridTable } from '@/components/ui/data-grid-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { setUserSearchTerm } from '@/features/users/usersSlice';
import {
  FEATURES,
  TYPES,
  formatCredits,
  formatWhen,
} from '@/features/wallet/walletLabels';
import {
  selectWalletFeature,
  selectWalletPagination,
  selectWalletType,
} from '@/features/wallet/walletSelectors';
import { setWalletFeature, setWalletType } from '@/features/wallet/walletSlice';
import { Amount, ByWhom, FeatureLabel, TypeBadge } from './wallet-cells';
import WalletPagination from './wallet-pagination';

const columnHelper = createColumnHelper();

// Radix selects cannot hold an empty string, so "every type" has a value of
// its own that is turned back into '' for the slice.
const EVERY = 'all';

/**
 * Every change to anyone's credits, newest first: what happened, to whom, by
 * which admin and why. The note is the admin's reason and is never shown in
 * the app.
 */
const WalletActivityTable = ({ items, totalItems, loading }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const type = useAppSelector(selectWalletType);
  const feature = useAppSelector(selectWalletFeature);
  const pagination = useAppSelector(selectWalletPagination);
  // The Users screen is where a person's own Credits card is; sending its
  // search their email lands on their row.
  const canFind = hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT);

  const columns = useMemo(
    () => [
      columnHelper.accessor('createdAt', {
        header: 'When',
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
      columnHelper.accessor('user', {
        header: 'Person',
        size: 230,
        cell: ({ getValue }) => {
          const user = getValue() || {};
          const name = user.name || 'Deleted account';
          return (
            <div className="min-w-0 space-y-0.5">
              {canFind && user.email ? (
                <button
                  type="button"
                  className="block max-w-full truncate text-start font-semibold hover:text-primary"
                  title="Find in Users"
                  onClick={() => {
                    dispatch(setUserSearchTerm(user.email));
                    navigate('/users');
                  }}
                >
                  {name}
                </button>
              ) : (
                <div className="truncate font-semibold">{name}</div>
              )}
              {user.email ? (
                <div className="truncate text-sm text-muted-foreground">
                  {user.email}
                </div>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        size: 170,
        cell: ({ getValue }) => <TypeBadge type={getValue()} />,
      }),
      columnHelper.accessor('feature', {
        header: 'Feature',
        size: 150,
        cell: ({ getValue }) => <FeatureLabel feature={getValue()} />,
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        size: 100,
        cell: ({ row }) => <Amount row={row.original} />,
      }),
      columnHelper.accessor('balanceAfter', {
        header: 'Balance after',
        size: 120,
        cell: ({ getValue, row }) => (
          <span
            className="text-sm tabular-nums"
            title={`Of which free: ${formatCredits(row.original.freeAfter)}`}
          >
            {formatCredits(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('by', {
        header: 'By',
        size: 140,
        cell: ({ getValue }) => <ByWhom by={getValue()} />,
      }),
      columnHelper.accessor('note', {
        header: 'Note',
        size: 240,
        cell: ({ getValue }) =>
          getValue() ? (
            <p className="line-clamp-2 text-sm" title={getValue()}>
              {getValue()}
            </p>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      }),
    ],
    [canFind, dispatch, navigate],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: {
      pagination: {
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
      },
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const filtered = Boolean(type || feature);

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
          <Coins className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            {filtered
              ? 'Nothing matches these filters'
              : 'No credits have moved yet'}
          </p>
          {filtered && (
            <p className="text-sm text-muted-foreground">
              Try another type or feature
            </p>
          )}
        </div>
      }
    >
      <CardHeader className="min-h-0 flex-col items-stretch gap-4 px-5 py-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold">
            Activity ({formatCredits(totalItems)})
          </CardTitle>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Select
              value={type || EVERY}
              onValueChange={(value) =>
                dispatch(setWalletType(value === EVERY ? '' : value))
              }
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Type">
                <SelectValue placeholder="Every type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY}>Every type</SelectItem>
                {TYPES.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={feature || EVERY}
              onValueChange={(value) =>
                dispatch(setWalletFeature(value === EVERY ? '' : value))
              }
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Feature">
                <SelectValue placeholder="Every feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY}>Every feature</SelectItem>
                {FEATURES.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardTable className="overflow-x-auto">
        <DataGridTable />
      </CardTable>

      <CardFooter className="px-5">
        <WalletPagination totalItems={totalItems} />
      </CardFooter>
    </DataGrid>
  );
};

export default WalletActivityTable;
