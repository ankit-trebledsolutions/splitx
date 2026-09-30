import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// The caption and big figure most cards on this page open with.
function HeadlineSkeleton({ className }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-9 w-24" />
    </div>
  );
}

// A card as the Users and AI cards are built: headline, bar, legend, a rule,
// then rows. The spacing classes are the real cards' own, so the two are the
// same height.
function CardSkeleton({ rows = 4, children }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-4">
        {children ?? (
          <>
            <HeadlineSkeleton />
            <Skeleton className="h-2 w-full mb-1.5" />
            <Skeleton className="h-5 w-40 mb-1" />
            <div className="border-b border-input"></div>
            <div className="grid gap-3">
              {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className="h-5 w-full" />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// The page while the first answer is on its way, laid out as the real one will
// be so nothing moves when the figures arrive. `withUsers` picks between the
// two layouts the page has, for the same reason.
export default function DashboardSkeleton({ withUsers }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:gap-7.5" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-7.5">
        {[1, 2, 3, 4].map((tile) => (
          <Card key={tile}>
            <CardContent className="p-0 flex flex-col justify-between gap-6 h-full">
              <Skeleton className="size-7 mt-4 ms-5" />
              <div className="flex flex-col gap-1 pb-4 px-5">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-32 max-w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
        <div className="lg:col-span-1">
          <CardSkeleton />
        </div>
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="flex flex-col justify-between items-stretch grow px-0 pt-5 pb-1">
              <HeadlineSkeleton className="px-5 lg:px-7.5 mb-3" />
              <div className="px-3">
                <Skeleton className="h-[250px] w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {withUsers ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
            <div className="lg:col-span-1">
              <CardSkeleton rows={3} />
            </div>
            <div className="lg:col-span-2">
              <CardSkeleton>
                {[1, 2, 3, 4, 5, 6].map((row) => (
                  <Skeleton key={row} className="h-9 w-full" />
                ))}
              </CardSkeleton>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-7.5 items-stretch">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7.5 items-stretch">
          <CardSkeleton rows={3} />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}
    </div>
  );
}
