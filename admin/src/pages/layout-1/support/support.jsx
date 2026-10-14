import { Helmet } from 'react-helmet-async';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import {
  useGetSupportReportsQuery,
  useGetSupportSummaryQuery,
} from '@/features/support/supportApi';
import {
  selectSupportCategory,
  selectSupportPagination,
  selectSupportSearchTerm,
  selectSupportStatus,
} from '@/features/support/supportSelectors';
import SupportTable from './support-table';

// The queue: everything people have sent from the app, newest first, narrowed
// by status, by kind, or by a search of the title and the reporter.
const Support = () => {
  const searchTerm = useAppSelector(selectSupportSearchTerm);
  const status = useAppSelector(selectSupportStatus);
  const category = useAppSelector(selectSupportCategory);
  const pagination = useAppSelector(selectSupportPagination);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';

  const { data, isFetching } = useGetSupportReportsQuery({
    search: activeSearchTerm,
    status,
    category,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });
  // The counts on the status tabs. Asked again every minute, like the badge
  // in the sidebar, so a report that arrives while the queue is open is seen.
  const { data: summary } = useGetSupportSummaryQuery(undefined, {
    pollingInterval: 60_000,
  });

  return (
    <>
      <Helmet>
        <title>Support - Splix Admin</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>Support</ToolbarPageTitle>
            <ToolbarDescription>
              Reports people sent from the app: bugs, ideas, trouble, and
              messages
            </ToolbarDescription>
          </ToolbarHeading>
        </Toolbar>

        <Card>
          <CardContent className="p-0">
            <SupportTable
              reports={data?.reports ?? []}
              totalItems={data?.total ?? 0}
              summary={summary}
              loading={isFetching}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Support;
