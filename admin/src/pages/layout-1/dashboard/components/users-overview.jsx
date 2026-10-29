import { Ban, LogIn, MailCheck, MailQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BadgeDot } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, toCount } from './format';
import { SIGN_IN_COLORS } from './palette';
import StatRow from './stat-row';

// Everyone with an app account, as they stand right now. Only the last row
// looks at the chosen period; the rest would read the same on any of them.
export default function UsersOverview({ users, days }) {
  const total = toCount(users?.total);
  const unverified = toCount(users?.unverified);

  // The two do not mirror each other. An account linked to Google may have a
  // password as well, and is counted under Google; the other bucket is the
  // accounts with no Google link at all, hence "only".
  const methods = [
    {
      key: 'password',
      label: 'Password only',
      count: toCount(users?.password),
    },
    { key: 'google', label: 'Google', count: toCount(users?.google) },
  ];
  // The bar is split by what the two counts add up to rather than by the
  // headline total, so it always fills its track.
  const signIns = methods.reduce((sum, method) => sum + method.count, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-normal text-secondary-foreground">
            App accounts
          </span>
          <span className="text-3xl font-semibold text-mono">
            {formatNumber(total)}
          </span>
        </div>

        {signIns > 0 ? (
          <div
            className="flex items-center gap-0.5 mb-1.5"
            role="img"
            aria-label={`How people sign in: ${methods
              .map((method) => `${method.label} ${formatNumber(method.count)}`)
              .join(', ')}`}
          >
            {methods
              .filter((method) => method.count > 0)
              .map((method) => (
                <div
                  key={method.key}
                  className={cn(
                    SIGN_IN_COLORS[method.key],
                    'h-2 min-w-1 rounded-xs',
                  )}
                  style={{ width: `${(method.count / signIns) * 100}%` }}
                ></div>
              ))}
          </div>
        ) : (
          <div className="bg-secondary h-2 rounded-xs mb-1.5"></div>
        )}

        <div className="flex items-center flex-wrap gap-4 mb-1">
          {methods.map((method) => (
            <div key={method.key} className="flex items-center gap-1.5">
              <BadgeDot
                className={cn(SIGN_IN_COLORS[method.key], 'opacity-100')}
              />
              <span className="text-sm font-normal text-foreground">
                {method.label}
              </span>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {formatNumber(method.count)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-b border-input"></div>

        <div className="grid gap-3">
          <StatRow
            icon={MailCheck}
            label="Email verified"
            value={formatNumber(Math.max(0, total - unverified))}
          />
          <StatRow
            icon={MailQuestion}
            label="Awaiting verification"
            value={formatNumber(unverified)}
          />
          <StatRow
            icon={Ban}
            label="Blocked"
            value={formatNumber(users?.blocked)}
          />
          <StatRow
            icon={LogIn}
            label={`Signed in, last ${days} days`}
            value={formatNumber(users?.signedIn)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
