import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { errorMessage } from '@/lib/api';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  AlertToolbar,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { useGetDashboardQuery } from '@/features/dashboard/dashboardApi';
import ActivityChart from './components/activity-chart';
import AiPlanner from './components/ai-planner';
import BreakdownCard from './components/breakdown-card';
import DashboardSkeleton from './components/dashboard-skeleton';
import KpiTiles from './components/kpi-tiles';
import RecentSignups from './components/recent-signups';
import UsersOverview from './components/users-overview';

const PERIODS = [7, 30, 90];

// "The last 30 days" is counted in calendar days where the admin is, so the
// server is told which zone that is. A browser that will not say gets UTC,
// and 'Etc/Unknown' is how some of them say they will not.
const resolvedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const BROWSER_TIME_ZONE =
  !resolvedZone || resolvedZone === 'Etc/Unknown' ? 'UTC' : resolvedZone;

/**
 * How Splix is being used: what exists, what was added lately, and how the AI
 * trip planner is holding up.
 *
 * One period control at the top scopes every figure described as "in the last
 * N days". One request answers the whole page, so the cards can never disagree
 * about which days they are counting.
 */
const Dashboard = () => {
  const [days, setDays] = useState(30);
  const [timeZone, setTimeZone] = useState(BROWSER_TIME_ZONE);
  const currentUser = useAppSelector(selectCurrentUser);

  const { data, error, isFetching, refetch } = useGetDashboardQuery(
    { days, timezone: timeZone },
    // Asked again on every visit: these are live counts, and an admin who
    // has just blocked someone expects the dashboard to have noticed.
    { refetchOnMountOrArgChange: true },
  );

  // A browser's list of time zones is newer than a database's, so the server
  // can be handed a zone it has never heard of. It answers 400, and would
  // every time: "Try again" could never succeed and the dashboard would stay
  // broken for that admin. The page asks once more in UTC instead. From here
  // a 400 can only be about the zone, because `days` comes from the fixed
  // list above.
  const zoneRefused = error?.status === 400 && timeZone !== 'UTC';
  useEffect(() => {
    if (zoneRefused) setTimeZone('UTC');
  }, [zoneRefused]);

  // A refusal that is about to be asked again in UTC is not shown: the error
  // would flash up for the moment before that request starts.
  const shownError = zoneRefused ? undefined : error;

  // The figures on screen say which zone they were counted in. When that is
  // not the browser's, the days are not the admin's own and the page says so.
  const countedZone = data?.range?.timezone;
  const zoneFellBack =
    Boolean(countedZone) && countedZone !== BROWSER_TIME_ZONE;

  // While a newly chosen period loads, `data` is still the previous answer
  // and stays on screen, dimmed. The labels are therefore taken from the
  // answer itself, so a figure is never captioned with a period it was not
  // counted over.
  const shownDays = data?.range?.days ?? days;

  // The server leaves the list of people out (null, not empty) for an admin
  // who may not see user records. The page then closes the gap instead of
  // showing a card with nothing in it.
  const canSeeUsers = Array.isArray(data?.recentUsers);

  const aiPlanner = <AiPlanner ai={data?.ai} days={shownDays} />;
  const groupsByType = (
    <BreakdownCard
      title="Groups by type"
      description={`Created in the last ${shownDays} days`}
      items={data?.groupTypes}
      labelKey="type"
      emptyText={`No groups were created in the last ${shownDays} days.`}
    />
  );
  const expensesByCategory = (
    <BreakdownCard
      title="Expenses by category"
      description={`Logged in the last ${shownDays} days`}
      items={data?.expenseCategories}
      labelKey="category"
      limit={5}
      emptyText={`No expenses were logged in the last ${shownDays} days.`}
    />
  );

  return (
    <div className="container">
      <Helmet>
        <title>Dashboard - Splix Admin</title>
      </Helmet>

      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Dashboard</ToolbarPageTitle>
          <ToolbarDescription>How Splix is being used</ToolbarDescription>
        </ToolbarHeading>
        <ToolbarActions>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(days)}
            // Radix answers '' when the active item is clicked again. Ignored,
            // or the page would be left with no period at all.
            onValueChange={(value) => {
              if (value) setDays(Number(value));
            }}
            aria-label="Period"
          >
            {PERIODS.map((period) => (
              <ToggleGroupItem
                key={period}
                value={String(period)}
                className="px-3"
              >
                {period} days
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ToolbarActions>
      </Toolbar>

      {shownError ? (
        <Alert variant="destructive" appearance="light" size="md">
          <AlertIcon>
            <AlertCircle />
          </AlertIcon>
          <AlertContent className="grow">
            <AlertTitle>The dashboard could not be loaded</AlertTitle>
            <AlertDescription>
              {errorMessage(shownError, 'The figures could not be loaded.')}
            </AlertDescription>
          </AlertContent>
          <AlertToolbar className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isFetching}
            >
              Try again
            </Button>
          </AlertToolbar>
        </Alert>
      ) : !data ? (
        <>
          {/* The skeleton is hidden from screen readers, which would otherwise
              be told nothing at all while the figures load. */}
          <div role="status" className="sr-only">
            Loading dashboard figures
          </div>
          {/* Which of the two layouts to sketch is guessed from the signed-in
              admin's own access, the same rule the server applies. */}
          <DashboardSkeleton
            withUsers={hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT)}
          />
        </>
      ) : (
        <div
          className={cn(
            'grid grid-cols-1 gap-5 lg:gap-7.5 transition-opacity',
            isFetching && 'opacity-60',
          )}
          aria-busy={isFetching}
        >
          {zoneFellBack ? (
            <p className="text-sm text-muted-foreground">
              {`Days are counted in ${countedZone}, because the server does not recognise this browser's time zone (${BROWSER_TIME_ZONE}).`}
            </p>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-7.5">
            <KpiTiles totals={data.totals} days={shownDays} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
            <div className="lg:col-span-1">
              <UsersOverview users={data.users} days={shownDays} />
            </div>
            <div className="lg:col-span-2">
              <ActivityChart
                series={data.series}
                totals={data.totals}
                days={shownDays}
              />
            </div>
          </div>

          {canSeeUsers ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
                <div className="lg:col-span-1">{aiPlanner}</div>
                <div className="lg:col-span-2">
                  <RecentSignups users={data.recentUsers} />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-7.5 items-stretch">
                {groupsByType}
                {expensesByCategory}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
              {aiPlanner}
              {groupsByType}
              {expensesByCategory}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
