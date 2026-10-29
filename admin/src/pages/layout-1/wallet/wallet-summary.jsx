import {
  CalendarSync,
  Gift,
  HandCoins,
  PhoneCall,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCredits,
  lastThirtyDays,
  plural,
} from '@/features/wallet/walletLabels';

// The two pots, side by side under the total they make.
const Pot = ({ label, value, hint }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
    <span className="shrink-0 font-semibold tabular-nums">
      {formatCredits(value)}
    </span>
  </div>
);

const HeldCard = ({ held, loading }) => {
  const free = held?.free ?? 0;
  const paid = held?.paid ?? 0;
  const wallets = held?.wallets ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits held</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5 lg:pt-5">
        {loading ? (
          <>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-mono text-3xl font-semibold tabular-nums">
                {formatCredits(free + paid)}
              </span>
              <span className="text-sm text-secondary-foreground">
                across {formatCredits(wallets)}{' '}
                {plural(wallets, 'wallet', 'wallets')}
              </span>
            </div>
            <Pot
              label="Free"
              value={free}
              hint="This month's free credits. Spent first, topped up at the start of each month."
            />
            <Pot
              label="Paid"
              value={paid}
              hint="Signup bonuses and grants. These never expire."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Each figure is credits; the line under it says how many times it happened.
const STATS = [
  {
    key: 'granted',
    label: 'Granted by admins',
    icon: HandCoins,
    detail: (stats) => {
      const { count } = stats.granted;
      const line = `${formatCredits(count)} ${plural(count, 'grant', 'grants')}`;
      return stats.deducted.amount > 0
        ? `${line} · ${formatCredits(stats.deducted.amount)} deducted`
        : line;
    },
  },
  {
    key: 'spentOnAi',
    label: 'Spent on AI plans',
    icon: Sparkles,
    detail: ({ spentOnAi: { count } }) =>
      `${formatCredits(count)} ${plural(count, 'plan', 'plans')} paid for`,
  },
  {
    key: 'spentOnCalls',
    label: 'Spent on group calls',
    icon: PhoneCall,
    detail: ({ spentOnCalls: { count } }) =>
      `${formatCredits(count)} ${plural(count, 'charge', 'charges')}`,
  },
  {
    key: 'refunded',
    label: 'Refunded',
    icon: RotateCcw,
    detail: ({ refunded: { count } }) =>
      `${formatCredits(count)} ${plural(count, 'refund', 'refunds')} for things that failed`,
  },
  {
    key: 'bonuses',
    label: 'Signup bonuses',
    icon: Gift,
    detail: ({ bonuses: { count } }) =>
      `${formatCredits(count)} new ${plural(count, 'wallet', 'wallets')}`,
  },
  {
    key: 'monthly',
    label: 'Monthly free credits',
    icon: CalendarSync,
    detail: ({ monthly: { count } }) =>
      `${formatCredits(count)} ${plural(count, 'top-up', 'top-ups')}`,
  },
];

const RecentCard = ({ rows, loading }) => {
  const stats = lastThirtyDays(rows);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Last 30 days</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 lg:p-7.5 lg:pt-5 xl:grid-cols-3">
        {STATS.map(({ key, label, icon: Icon, detail }) => (
          <div key={key} className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm text-secondary-foreground">{label}</div>
              {loading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <>
                  <div className="text-mono text-xl font-semibold tabular-nums">
                    {formatCredits(stats[key].amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {detail(stats)}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/**
 * What everyone holds right now, and where credits came from and went in the
 * last 30 days.
 */
export default function WalletSummary({ summary, loading }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-7.5">
      <HeldCard held={summary?.held} loading={loading} />
      <RecentCard rows={summary?.last30Days} loading={loading} />
    </div>
  );
}
