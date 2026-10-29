import { Hash, Timer, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatCompact,
  formatDuration,
  formatNumber,
  percentOf,
  toCount,
} from './format';
import StatRow from './stat-row';

// The three ways a run can stand. Two wear the theme's own status colours.
// The neutral one is given a mid grey of its own, because the secondary badge
// fill is the colour of an empty track and all but vanishes against the card.
// This grey shows up in light and dark mode alike. It is not blue, orange or
// violet, which already mean something else on this page.
const STATES = [
  { key: 'done', label: 'Completed', variant: 'success' },
  { key: 'failed', label: 'Failed', variant: 'destructive' },
  {
    key: 'running',
    label: 'In progress',
    variant: 'secondary',
    className: 'bg-muted-foreground',
  },
];

// What each failure code means, in a few words. The wording follows the
// messages the app shows its own users (ERROR_MESSAGES in
// backend/src/services/aiItinerary.service.js). A code added there and not
// here is shown as it is, which is still better than hiding it.
const FAILURE_LABELS = {
  AI_UNAVAILABLE: 'Planner unavailable',
  AI_BUSY: 'Planner busy',
  AI_TIMEOUT: 'Took too long',
  AI_STALE: 'Took too long',
  AI_REFUSED: 'Trip could not be planned',
  AI_BAD_DESTINATION: 'Destination not recognised',
  AI_TRUNCATED: 'Plan came out too long',
  AI_BAD_OUTPUT: 'Plan could not be read',
  AI_CONFLICT: 'Itinerary changed meanwhile',
  AI_CANCELLED: 'Cancelled',
  AI_FAILED: 'Something went wrong',
};

const completionVariant = (percent) => {
  if (percent >= 80) return 'success';
  if (percent >= 50) return 'warning';
  return 'destructive';
};

// How the AI trip planner did over the chosen period.
export default function AiPlanner({ ai, days }) {
  const counts = {
    done: toCount(ai?.done),
    failed: toCount(ai?.failed),
    running: toCount(ai?.running),
  };
  const counted = counts.done + counts.failed + counts.running;

  // Of the runs that have finished one way or the other. A run still going
  // has not failed, so it is left out rather than dragging the figure down.
  // That is also why the badge says "succeeded" and not "completed": with one
  // plan done and two still running it reads 100%, which is true of the plans
  // that finished and would be false of the plans requested.
  const succeeded = percentOf(counts.done, counts.done + counts.failed);

  const tokens = toCount(ai?.inputTokens) + toCount(ai?.outputTokens);
  const topFailure = ai?.failures?.[0];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>AI trip planner</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-normal text-secondary-foreground">
            Plans requested in the last {days} days
          </span>
          <div className="flex items-center flex-wrap gap-2.5">
            <span className="text-3xl font-semibold text-mono">
              {formatNumber(ai?.runs)}
            </span>
            {succeeded !== null ? (
              <Badge
                size="sm"
                variant={completionVariant(succeeded)}
                appearance="light"
                title="Of plans that have finished"
              >
                {succeeded}% succeeded
              </Badge>
            ) : null}
          </div>
        </div>

        {counted > 0 ? (
          <>
            <div className="flex items-center gap-0.5 mb-1.5" aria-hidden="true">
              {STATES.filter((state) => counts[state.key] > 0).map((state) => (
                <Badge
                  key={state.key}
                  variant={state.variant}
                  className={cn('h-2 min-w-1 px-0 rounded-xs', state.className)}
                  style={{ width: `${(counts[state.key] / counted) * 100}%` }}
                ></Badge>
              ))}
            </div>

            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mb-1">
              {STATES.map((state) => (
                <div key={state.key} className="flex items-center gap-1.5">
                  <Badge
                    variant={state.variant}
                    className={cn(
                      'size-2 min-w-0 p-0 rounded-full',
                      state.className,
                    )}
                  ></Badge>
                  <span className="text-sm font-normal text-foreground">
                    {state.label}
                  </span>
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatNumber(counts[state.key])}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody has asked the AI for a plan in the last {days} days.
          </p>
        )}

        <div className="border-b border-input"></div>

        <div className="grid gap-3">
          <StatRow
            icon={Timer}
            label="Average time to plan"
            value={formatDuration(ai?.averageMs)}
          />
          <StatRow
            icon={Hash}
            label="Tokens used"
            value={formatCompact(tokens)}
            title={formatNumber(tokens)}
          />
          <StatRow
            icon={TriangleAlert}
            label="Most common failure"
            value={
              topFailure
                ? `${FAILURE_LABELS[topFailure.code] || topFailure.code || 'Unknown'} (${formatNumber(topFailure.count)})`
                : 'None'
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
