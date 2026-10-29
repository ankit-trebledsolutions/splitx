import { Fragment } from 'react';
import { ReceiptText, Sparkles, UserRound, Users } from 'lucide-react';
import { toAbsoluteUrl } from '@/lib/helpers';
import { Card, CardContent } from '@/components/ui/card';
import ChangeBadge from './change-badge';
import { formatCompact, formatNumber, toCount } from './format';

const TILES = [
  { key: 'users', label: 'Users', icon: UserRound },
  { key: 'groups', label: 'Groups', icon: Users },
  { key: 'expenses', label: 'Expenses logged', icon: ReceiptText },
  { key: 'aiPlans', label: 'AI plans', icon: Sparkles },
];

// The four headline counts. The big figure is everything that exists today
// and stands alone. The last line is about the chosen period only, and the
// badge sits on that line because it is the figure the badge compares: beside
// the total, "+100%" read as the whole user base doubling.
export default function KpiTiles({ totals, days }) {
  return (
    <Fragment>
      <style>
        {`
          .dashboard-kpi-bg {
            background-image: url('${toAbsoluteUrl('/media/images/2600x1600/bg-3.png')}');
          }
          .dark .dashboard-kpi-bg {
            background-image: url('${toAbsoluteUrl('/media/images/2600x1600/bg-3-dark.png')}');
          }
        `}
      </style>

      {TILES.map(({ key, label, icon: Icon }) => {
        const total = toCount(totals?.[key]?.total);
        const current = toCount(totals?.[key]?.current);

        return (
          <Card key={key}>
            <CardContent className="p-0 flex flex-col justify-between gap-6 h-full bg-cover rtl:bg-[left_top_-1.7rem] bg-[right_top_-1.7rem] bg-no-repeat dashboard-kpi-bg">
              <Icon className="size-7 mt-4 ms-5 text-muted-foreground" />
              <div className="flex flex-col gap-1 pb-4 px-5">
                <span
                  className="text-3xl font-semibold text-mono"
                  title={formatNumber(total)}
                >
                  {formatCompact(total)}
                </span>
                <span className="text-sm font-normal text-secondary-foreground">
                  {label}
                </span>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-h-5">
                  <span className="text-xs font-normal text-muted-foreground">
                    {current > 0
                      ? `+${formatCompact(current)} in the last ${days} days`
                      : `None in the last ${days} days`}
                  </span>
                  <ChangeBadge
                    current={current}
                    previous={totals?.[key]?.previous}
                    days={days}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </Fragment>
  );
}
