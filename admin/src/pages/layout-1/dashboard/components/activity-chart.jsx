import { Component, lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import ChangeBadge from './change-badge';
import {
  axisScale,
  dayToUtc,
  formatCompact,
  formatDay,
  formatNumber,
  plural,
  toCount,
} from './format';
import { AXIS_LABEL_COLOR, GRID_COLOR, SERIES_COLOR } from './palette';

// The chart library is bigger than the rest of this page put together, and
// nothing else in the panel uses it. Loaded when the dashboard is, so nobody
// waits for it on the way to another screen.
const ApexChart = lazy(() => import('react-apexcharts'));

const CHART_HEIGHT = 250;

// The chart's file can fail to arrive: the network drops for a moment, or a
// new version of the panel was deployed while this tab was open and the old
// file, whose name carries a hash, is no longer on the server. With nothing to
// catch that, React takes the whole app off the screen and the landing page
// goes blank. Caught here, only the chart's own space is given up.
//
// The way back is reloading the page, and nothing less. React.lazy remembers
// the failed import, so drawing this again would only fail again; a "try
// again" that re-rendered would be a button that does nothing.
class ChartBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        className="flex flex-col items-center justify-center gap-3 px-3 text-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-sm text-muted-foreground">
          The chart could not be loaded. Reloading the page usually brings it
          back.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    );
  }
}

// `key` is the field in each day of the series and in the totals.
const METRICS = [
  {
    key: 'users',
    label: 'Sign-ups',
    caption: 'New sign-ups',
    one: 'sign-up',
    many: 'sign-ups',
  },
  {
    key: 'groups',
    label: 'Groups',
    caption: 'Groups created',
    one: 'group',
    many: 'groups',
  },
  {
    key: 'expenses',
    label: 'Expenses',
    caption: 'Expenses logged',
    one: 'expense',
    many: 'expenses',
  },
];

// What happened day by day over the chosen period. One measure at a time: the
// three are on very different scales, and sharing an axis would flatten the
// small ones into the floor.
export default function ActivityChart({ series, totals, days }) {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((item) => item.key === metricKey) ?? METRICS[0];
  const total = toCount(totals?.[metric.key]?.current);

  // A day whose date cannot be read is dropped rather than drawn at 1970.
  const points = useMemo(
    () =>
      (series ?? [])
        .map((day) => ({
          date: day?.date,
          x: dayToUtc(day?.date),
          y: toCount(day?.[metric.key]),
        }))
        .filter((point) => Number.isFinite(point.x)),
    [series, metric.key],
  );

  const chartSeries = useMemo(
    () => [{ name: metric.label, data: points.map(({ x, y }) => ({ x, y })) }],
    [points, metric.label],
  );

  // Memoised because react-apexcharts redraws the whole chart whenever it is
  // handed a new options object, and this component re-renders for reasons
  // that have nothing to do with the chart.
  const options = useMemo(() => {
    // Counts are whole, so the axis only ever shows whole numbers, in round
    // steps from zero. See axisScale for how they are chosen.
    const peak = Math.max(0, ...points.map((point) => point.y));
    const axis = axisScale(peak);

    // Someone who has asked their system for less motion gets the chart drawn
    // in place, without the sweep ApexCharts opens with.
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    return {
      chart: {
        height: CHART_HEIGHT,
        type: 'area',
        animations: {
          enabled: !reduceMotion,
        },
        // ApexCharts otherwise reserves 15px under the chart, which would make
        // the card jump when the skeleton gives way to it.
        parentHeightOffset: 0,
        toolbar: {
          show: false,
        },
        // A time axis is zoomable by dragging unless told otherwise, and there
        // is nothing to zoom into in a run of daily counts.
        zoom: {
          enabled: false,
        },
      },
      colors: [SERIES_COLOR],
      dataLabels: {
        enabled: false,
      },
      legend: {
        show: false,
      },
      stroke: {
        // Not 'smooth': between a zero and a spike it dips under the axis,
        // which reads as a negative number of sign-ups.
        curve: 'monotoneCubic',
        show: true,
        width: 2,
        colors: [SERIES_COLOR],
      },
      xaxis: {
        // Each point sits at midnight UTC of its day and the labels are
        // written in UTC as well, so the axis shows the calendar day the
        // server meant and not the one this browser's zone would shift it to.
        type: 'datetime',
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
        labels: {
          datetimeUTC: true,
          style: {
            colors: AXIS_LABEL_COLOR,
            fontSize: '12px',
          },
        },
        crosshairs: {
          position: 'front',
          stroke: {
            color: SERIES_COLOR,
            width: 1,
            dashArray: 3,
          },
        },
        tooltip: {
          enabled: false,
        },
      },
      yaxis: {
        min: 0,
        max: axis.max,
        tickAmount: axis.ticks,
        axisTicks: {
          show: false,
        },
        labels: {
          style: {
            colors: AXIS_LABEL_COLOR,
            fontSize: '12px',
          },
          formatter: (value) => formatCompact(Math.round(value)),
        },
      },
      tooltip: {
        enabled: true,
        // Built only from a number and a date formatted here, so nothing that
        // came from a user ever reaches this markup.
        custom({ dataPointIndex }) {
          const point = points[dataPointIndex];
          if (!point) return '';

          return `
          <div class="flex flex-col gap-1 p-3.5">
            <div class="font-semibold text-base text-foreground">${formatNumber(point.y)} ${plural(point.y, metric.one, metric.many)}</div>
            <div class="font-medium text-sm text-secondary-foreground">${formatDay(point.date)}</div>
          </div>
          `;
        },
      },
      markers: {
        size: 0,
        colors: 'var(--color-background)',
        strokeColors: SERIES_COLOR,
        strokeWidth: 3,
        strokeOpacity: 1,
        strokeDashArray: 0,
        fillOpacity: 1,
        discrete: [],
        shape: 'circle',
        offsetX: 0,
        offsetY: 0,
        showNullDataPoints: true,
        // Smaller than the template draws it. With 90 days on the axis the
        // points are a few pixels apart, and a marker the size of the
        // original would sit on top of the days either side.
        hover: {
          size: 5,
          sizeOffset: 0,
        },
      },
      fill: {
        gradient: {
          opacityFrom: 0.25,
          opacityTo: 0,
        },
      },
      grid: {
        borderColor: GRID_COLOR,
        strokeDashArray: 0,
        yaxis: {
          lines: {
            show: true,
          },
        },
        xaxis: {
          lines: {
            show: false,
          },
        },
      },
    };
  }, [points, metric.one, metric.many]);

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <CardTitle>Activity</CardTitle>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={metric.key}
          // Radix answers '' when the active item is clicked again. Ignored,
          // or the chart would be left with no measure to draw.
          onValueChange={(value) => {
            if (value) setMetricKey(value);
          }}
          aria-label="What the chart shows"
        >
          {METRICS.map((item) => (
            <ToggleGroupItem key={item.key} value={item.key} className="px-2.5">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col justify-between items-stretch grow px-0 pt-5 pb-1">
        <div className="flex flex-col gap-0.5 px-5 lg:px-7.5 mb-3">
          <span className="text-sm font-normal text-secondary-foreground">
            {metric.caption} in the last {days} days
          </span>
          <div className="flex items-center gap-2.5">
            <span className="text-3xl font-semibold text-mono">
              {formatNumber(total)}
            </span>
            <ChangeBadge
              current={total}
              previous={totals?.[metric.key]?.previous}
              days={days}
            />
          </div>
        </div>

        <ChartBoundary>
          <div
            className="px-3"
            role="img"
            aria-label={`${metric.label} per day over the last ${days} days, ${formatNumber(total)} in total`}
          >
            {points.length === 0 ? (
              <p
                className="flex items-center justify-center text-sm text-muted-foreground"
                style={{ height: CHART_HEIGHT }}
              >
                There is nothing to chart for this period.
              </p>
            ) : (
              <Suspense
                fallback={
                  <Skeleton
                    className="w-full"
                    style={{ height: CHART_HEIGHT }}
                  />
                }
              >
                <ApexChart
                  options={options}
                  series={chartSeries}
                  type="area"
                  height={CHART_HEIGHT}
                />
              </Suspense>
            )}
          </div>
        </ChartBoundary>
      </CardContent>
    </Card>
  );
}
