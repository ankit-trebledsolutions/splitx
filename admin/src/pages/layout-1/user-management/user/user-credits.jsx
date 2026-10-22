import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleMinus,
  CirclePlus,
  Coins,
} from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { ACCESS_LEVEL, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { useGetUserWalletQuery } from '@/features/wallet/walletApi';
import { formatCredits, formatWhen } from '@/features/wallet/walletLabels';
import {
  Amount,
  ByWhom,
  FeatureLabel,
  TypeBadge,
} from '@/pages/layout-1/wallet/wallet-cells';
import AdjustCreditsDialog from './adjust-credits-dialog';

const PAGE_SIZE = 5;

const Figure = ({ label, value, hint, strong }) => (
  <div className="rounded-lg border border-border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div
      className={
        strong
          ? 'text-mono text-2xl font-semibold tabular-nums'
          : 'text-lg font-semibold tabular-nums'
      }
    >
      {formatCredits(value)}
    </div>
    {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
  </div>
);

/**
 * One person's credits: the balance, the two pots it is made of, and every
 * change to it. Admins with write access to the wallet can grant or deduct,
 * except on their own account; the server refuses that too.
 *
 * Opening this gives the person a wallet if they had none yet (with the
 * signup bonus), exactly as their next visit to the app would.
 */
export default function UserCredits({ user }) {
  const currentUser = useAppSelector(selectCurrentUser);
  const isSelf =
    String(currentUser?._id ?? currentUser?.id ?? '') === String(user.id);
  const canAdjust =
    !isSelf &&
    hasPermission(currentUser, PERMISSIONS.WALLET, ACCESS_LEVEL.READ_WRITE);

  const [page, setPage] = useState(1);
  // 'grant' or 'deduct' while the dialog is open.
  const [adjusting, setAdjusting] = useState(null);

  const { data, isLoading, isFetching, error } = useGetUserWalletQuery({
    id: user.id,
    page,
    limit: PAGE_SIZE,
  });

  const wallet = data?.wallet;
  const history = data?.transactions;
  const rows = history?.items ?? [];
  const pages = history?.pages ?? 1;

  return (
    <Card>
      <CardHeader className="min-h-12">
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          Credits
        </CardTitle>
        {canAdjust && wallet ? (
          <CardToolbar>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdjusting('grant')}
            >
              <CirclePlus />
              Grant credits
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdjusting('deduct')}
              disabled={(wallet.balance ?? 0) <= 0}
              title={
                (wallet.balance ?? 0) <= 0
                  ? 'They have no credits to deduct'
                  : undefined
              }
            >
              <CircleMinus />
              Deduct credits
            </Button>
          </CardToolbar>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-32 w-full" />
          </>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {error.status === 404
              ? 'Credits are not available for this account.'
              : errorMessage(error, 'The credits could not be loaded.')}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Figure label="Balance" value={wallet?.balance} strong />
              <Figure
                label="Free this month"
                value={wallet?.free}
                hint="Spent first, reset monthly"
              />
              <Figure label="Paid" value={wallet?.paid} hint="Never expire" />
            </div>

            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No credits have moved yet.
              </p>
            ) : (
              <div
                className={`overflow-x-auto rounded-lg border border-border ${
                  isFetching ? 'opacity-60' : ''
                }`}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead className="text-end">Amount</TableHead>
                      <TableHead className="text-end">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
                          {formatWhen(row.createdAt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <TypeBadge type={row.type} />
                            {row.feature ? (
                              <FeatureLabel feature={row.feature} />
                            ) : null}
                          </div>
                          {row.by ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              By <ByWhom by={row.by} />
                            </div>
                          ) : null}
                          {row.note ? (
                            <p className="mt-1 text-xs break-words text-muted-foreground">
                              “{row.note}”
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end align-top">
                          <Amount row={row} />
                        </TableCell>
                        <TableCell className="text-end align-top text-sm tabular-nums">
                          {formatCredits(row.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {pages > 1 ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    mode="icon"
                    aria-label="Newer"
                    disabled={page <= 1 || isFetching}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    mode="icon"
                    aria-label="Older"
                    disabled={page >= pages || isFetching}
                    onClick={() =>
                      setPage((current) => Math.min(pages, current + 1))
                    }
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      {canAdjust && wallet ? (
        <AdjustCreditsDialog
          open={adjusting !== null}
          type={adjusting ?? 'grant'}
          user={user}
          wallet={wallet}
          onOpenChange={(open) => {
            if (!open) setAdjusting(null);
          }}
          // The new row is the newest, so it is on the first page.
          onDone={() => setPage(1)}
        />
      ) : null}
    </Card>
  );
}
