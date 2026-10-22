import { AlertCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { errorMessage } from '@/lib/api';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import {
  useGetWalletSummaryQuery,
  useGetWalletTransactionsQuery,
} from '@/features/wallet/walletApi';
import {
  selectWalletFeature,
  selectWalletPagination,
  selectWalletType,
} from '@/features/wallet/walletSelectors';
import BalanceCheck from './balance-check';
import WalletActivityTable from './wallet-activity-table';
import WalletSettingsCard from './wallet-settings-card';
import WalletSummary from './wallet-summary';

/**
 * Credits across the app: what everyone holds, where credits went lately,
 * whether every balance still adds up, what features cost, and every change
 * to anyone's credits. A person's own credits, and granting or deducting
 * them, are on their row in Users.
 */
const Wallet = () => {
  const type = useAppSelector(selectWalletType);
  const feature = useAppSelector(selectWalletFeature);
  const pagination = useAppSelector(selectWalletPagination);

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useGetWalletSummaryQuery();
  const { data: activity, isFetching } = useGetWalletTransactionsQuery({
    type,
    feature,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });

  return (
    <>
      <Helmet>
        <title>Wallet - Splix Admin</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>Wallet</ToolbarPageTitle>
            <ToolbarDescription>
              Credits people hold and spend in the app, and what each feature
              costs
            </ToolbarDescription>
          </ToolbarHeading>
        </Toolbar>

        <div className="flex flex-col gap-5 lg:gap-7.5">
          {summaryError ? (
            <Alert variant="destructive" appearance="light" size="md">
              <AlertIcon>
                <AlertCircle />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {errorMessage(
                    summaryError,
                    'The summary could not be loaded.',
                  )}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <>
              <WalletSummary summary={summary} loading={summaryLoading} />
              <BalanceCheck check={summary?.check} loading={summaryLoading} />
            </>
          )}

          <WalletSettingsCard />

          <Card>
            <CardContent className="p-0">
              <WalletActivityTable
                items={activity?.items ?? []}
                totalItems={activity?.total ?? 0}
                loading={isFetching}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default Wallet;
