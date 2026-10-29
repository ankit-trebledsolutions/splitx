import { Fragment } from 'react';
import { AlertCircle, TriangleAlert } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { errorMessage } from '@/lib/api';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetIntegrationsQuery } from '@/features/integrations/integrationsApi';
import IntegrationSection from './integration-section';
import RecentChanges from './recent-changes';

/**
 * The outside services Splix runs on, and the keys for each.
 *
 * A key changed here is used by the app straight away: no file to edit on the
 * server, no restart. Anything not changed here keeps running on the value the
 * server was set up with.
 */
const ThirdPartyApis = () => {
  const { data, isLoading, error } = useGetIntegrationsQuery();
  const integrations = data?.integrations ?? [];

  return (
    <>
      <Helmet>
        <title>Third-Party APIs - Splix Admin</title>
      </Helmet>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="space-y-1.5 py-4">
              <CardTitle>Manage APIs</CardTitle>
              <CardDescription>
                Manage your third-party API integrations. A change here is
                used by the app straight away, with nothing to restart.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            {error ? (
              <Alert variant="destructive" appearance="light" size="md">
                <AlertIcon>
                  <AlertCircle />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {errorMessage(error, 'The services could not be loaded.')}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {data && !data.canSaveSecrets ? (
              <Alert variant="warning" appearance="light" size="md">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Keys cannot be saved from here yet</AlertTitle>
                  <AlertDescription>
                    The server has not been given its encryption key
                    (SETTINGS_ENCRYPTION_KEY), so it has no safe way to store
                    an API key. Setting it is a one-time step for your
                    developer. Until then you can see what is in use, test
                    keys, and change anything that is not a secret.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {isLoading
              ? [1, 2, 3].map((row) => (
                  <Fragment key={row}>
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-8.5 w-full" />
                      <Skeleton className="h-8.5 w-full" />
                    </div>
                    {row < 3 ? <Separator /> : null}
                  </Fragment>
                ))
              : integrations.map((integration, index) => (
                  <Fragment key={integration.key}>
                    <IntegrationSection
                      integration={integration}
                      number={index + 1}
                      canSaveSecrets={data.canSaveSecrets}
                    />
                    {index < integrations.length - 1 ? <Separator /> : null}
                  </Fragment>
                ))}
          </CardContent>
        </Card>

        <RecentChanges />
      </div>
    </>
  );
};

export default ThirdPartyApis;
