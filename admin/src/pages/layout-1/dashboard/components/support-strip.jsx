import { ArrowRight, LifeBuoy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { useGetSupportSummaryQuery } from '@/features/support/supportApi';
import { STATUSES, plural } from '@/features/support/supportLabels';
import { formatNumber, toCount } from './format';

/**
 * What is waiting in Support, in one line above the figures. Only for an admin
 * who could open the queue: the counts are theirs to act on, and the server
 * would refuse anyone else anyway. Asked again every minute, so a report that
 * comes in while the dashboard is open is seen.
 */
export default function SupportStrip() {
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const canSee = hasPermission(currentUser, PERMISSIONS.SUPPORT);
  const { data, isLoading, isError } = useGetSupportSummaryQuery(undefined, {
    skip: !canSee,
    pollingInterval: 60_000,
  });

  if (!canSee || isError) return null;

  const pending = toCount(data?.pending);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <LifeBuoy className="size-7 shrink-0 text-muted-foreground" />
        <div className="min-w-0 grow">
          <div className="font-semibold text-mono">Support</div>
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-48" />
          ) : (
            <p className="text-sm text-secondary-foreground">
              {pending === 0
                ? 'Nothing is waiting. Every report has been answered or put away.'
                : `${formatNumber(pending)} ${plural(pending, 'report needs', 'reports need')} attention`}
            </p>
          )}
        </div>
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((entry) => (
              <Badge
                key={entry.key}
                variant={entry.variant}
                appearance="light"
                title={`${entry.label}: ${formatNumber(data?.[entry.key])}`}
              >
                {entry.label} {formatNumber(data?.[entry.key])}
              </Badge>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={() => navigate('/support')}>
          Open the queue
          <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  );
}
