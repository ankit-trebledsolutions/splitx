import { CircleCheck, TriangleAlert } from 'lucide-react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  amountTone,
  formatCredits,
  formatSignedCredits,
  plural,
} from '@/features/wallet/walletLabels';

// The server lists at most this many, so a full list may not be all of them.
const SERVER_LIMIT = 20;

const Pots = ({ free, paid }) => (
  <span className="tabular-nums">
    {formatCredits((free ?? 0) + (paid ?? 0))}
    <span className="text-xs text-muted-foreground">
      {' '}
      (free {formatCredits(free)}, paid {formatCredits(paid)})
    </span>
  </span>
);

/**
 * Whether every balance is explained by its history. The server adds up each
 * wallet's history every time the summary is asked for; a wallet whose
 * balance is not that sum was changed some other way, and an admin should
 * hear about it rather than find out from a confused user.
 */
export default function BalanceCheck({ check, loading }) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (!check) return null;

  const mismatches = check.mismatches ?? [];
  const checked = check.checked ?? 0;

  if (mismatches.length === 0) {
    return (
      <Alert variant="success" appearance="light" size="md">
        <AlertIcon>
          <CircleCheck />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Every balance matches its history</AlertTitle>
          <AlertDescription>
            Checked {formatCredits(checked)}{' '}
            {plural(checked, 'wallet', 'wallets')}: each one holds exactly what
            its history adds up to.
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  const count = mismatches.length;

  return (
    <Alert variant="destructive" appearance="light" size="md">
      <AlertIcon>
        <TriangleAlert />
      </AlertIcon>
      <AlertContent className="min-w-0">
        <AlertTitle>
          {count >= SERVER_LIMIT ? `${count} or more` : count}{' '}
          {plural(count, 'balance does', 'balances do')} not match{' '}
          {plural(count, 'its', 'their')} history
        </AlertTitle>
        <AlertDescription>
          <p>
            {plural(count, 'This wallet holds', 'These wallets hold')} a
            different number of credits than {plural(count, 'its', 'their')}{' '}
            history adds up to, so something changed a balance outside the app's
            normal way of doing it. Nothing has been fixed automatically: pass
            the account ids below to your developer.
            {count >= SERVER_LIMIT
              ? ` Only the first ${SERVER_LIMIT} are listed.`
              : ''}
          </p>
          <div className="mt-3 overflow-x-auto rounded-md border border-border bg-background text-foreground">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account id</TableHead>
                  <TableHead>Balance now</TableHead>
                  <TableHead>History adds up to</TableHead>
                  <TableHead className="text-end">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((entry) => {
                  const now =
                    (entry.wallet?.free ?? 0) + (entry.wallet?.paid ?? 0);
                  const history =
                    (entry.history?.free ?? 0) + (entry.history?.paid ?? 0);
                  const difference = now - history;
                  return (
                    <TableRow key={String(entry.user)}>
                      <TableCell>
                        <code className="text-xs">{String(entry.user)}</code>
                      </TableCell>
                      <TableCell>
                        <Pots {...entry.wallet} />
                      </TableCell>
                      <TableCell>
                        <Pots {...entry.history} />
                      </TableCell>
                      <TableCell
                        className={`text-end font-semibold tabular-nums ${amountTone(difference)}`}
                      >
                        {formatSignedCredits(difference)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
