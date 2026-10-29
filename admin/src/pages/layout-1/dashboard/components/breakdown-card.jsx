import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { capitalise, formatNumber, toCount } from './format';
import { SERIES_BAR } from './palette';

// Past the first few, a ranking stops being readable, so the tail is added up
// into a single 'Other' row. A value the app itself calls "other" joins that
// row instead of sitting beside it: two rows both reading "Other" would be a
// puzzle.
//
// Only a tail of two or more is folded. With one row left over there is
// nothing to add up: folding would save no space and only take that row's
// name away.
const foldRows = (rows, limit) => {
  if (!limit || rows.length <= limit + 1) return rows;

  const top = rows.filter((row) => row.key !== 'other').slice(0, limit);
  const count = rows
    .filter((row) => !top.includes(row))
    .reduce((sum, row) => sum + row.count, 0);

  return count > 0 ? [...top, { key: 'other', label: 'Other', count }] : top;
};

// A count per kind of thing: groups by their type, expenses by their category.
// Every bar is the same colour. The kinds have no order of their own, and the
// length of a bar already says how big it is; a second colour would only say
// it again.
export default function BreakdownCard({
  title,
  description,
  items,
  labelKey,
  limit,
  emptyText,
}) {
  const rows = foldRows(
    (items ?? [])
      .map((item) => ({
        key: String(item?.[labelKey] ?? ''),
        label: capitalise(item?.[labelKey]),
        count: toCount(item?.count),
      }))
      .filter((row) => row.count > 0),
    limit,
  );
  const max = Math.max(0, ...rows.map((row) => row.count));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-4">
        <CardDescription>{description}</CardDescription>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="grid gap-4">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-normal text-mono">
                    {row.label}
                  </span>
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatNumber(row.count)}
                  </span>
                </div>
                <div
                  className="bg-secondary h-2 rounded-full"
                  aria-hidden="true"
                >
                  <div
                    className={cn(SERIES_BAR, 'h-2 min-w-1 rounded-full')}
                    style={{ width: `${max > 0 ? (row.count / max) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
