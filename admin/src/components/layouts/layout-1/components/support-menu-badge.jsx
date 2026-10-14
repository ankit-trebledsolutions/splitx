import { Badge } from '@/components/ui/badge';
import { useGetSupportSummaryQuery } from '@/features/support/supportApi';

// How many reports are waiting, beside the Support entry in the sidebar. The
// menu only mounts this for an admin who may open the queue, so the request
// is never made by somebody the server would refuse. Asked again every
// minute; the queue page and the dashboard share the same cached answer.
export function SupportMenuBadge() {
  const { data } = useGetSupportSummaryQuery(undefined, {
    pollingInterval: 60_000,
  });
  const pending = data?.pending ?? 0;
  if (!pending) return null;
  return (
    <Badge
      variant="destructive"
      size="sm"
      shape="circle"
      className="ms-auto min-w-5 px-1.5"
      aria-label={`${pending} reports waiting`}
    >
      {pending > 99 ? '99+' : pending}
    </Badge>
  );
}
