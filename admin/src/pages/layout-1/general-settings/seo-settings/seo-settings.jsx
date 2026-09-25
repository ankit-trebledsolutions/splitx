import { useEffect, useMemo, useState } from 'react';
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from '@/features/general/generalSettingApi';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const SeoSettings = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('seo');
  const [
    updateSettings,
    { isLoading: isUpdating, error: updateSettingsError },
  ] = useUpdateSettingsMutation();

  const serverError = useMemo(() => {
    const error = updateSettingsError || getSettingsError;
    return error?.data?.message || error?.error || null;
  }, [getSettingsError, updateSettingsError]);

  const form = useForm({
    defaultValues: {
      siteTrackingScript: {
        languageCodeAdded: false,
        siteTrackingCode: '',
      },
      googleTagManager: {
        headScript: '',
        bodyScript: '',
      },
    },
  });

  const onSubmit = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'seo', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  useEffect(() => {
    if (settings?.seo) {
      form.reset({
        siteTrackingScript: {
          languageCodeAdded:
            settings.seo.siteTrackingScript?.languageCodeAdded || false,
          siteTrackingCode:
            settings.seo.siteTrackingScript?.siteTrackingCode || '',
        },
        googleTagManager: {
          headScript: settings.seo.googleTagManager?.headScript || '',
          bodyScript: settings.seo.googleTagManager?.bodyScript || '',
        },
      });
    }
  }, [settings, form]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>SEO Settings</CardTitle>
              <CardDescription>Manage your SEO settings</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {!dismissedError && serverError ? (
                <Alert
                  variant="destructive"
                  appearance="light"
                  size="md"
                  close
                  onClose={() => setDismissedError(true)}
                  className="mt-6 flex items-center gap-3 justify-between"
                >
                  <AlertIcon>
                    <AlertCircle className="h-5 w-5" />
                  </AlertIcon>
                  <AlertContent className="space-y-0 text-left w-full">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{serverError}</AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              <div className="flex justify-between">
                <CardTitle>1. Site Tracking Script</CardTitle>
                <FormField
                  control={form.control}
                  name="siteTrackingScript.languageCodeAdded"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Add language code to site URLs
                        </CardDescription>
                      </div>
                      <FormControl>
                        <Switch
                          className="data-[state=checked]:bg-blue-500 "
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="siteTrackingScript.siteTrackingCode"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="siteTrackingCode"
                    >
                      Site Tracking Code
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="siteTrackingCode"
                        placeholder="**********"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <Separator />
              <CardTitle>2. Google Tag Manager</CardTitle>
              <FormField
                control={form.control}
                name="googleTagManager.headScript"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="headScript"
                    >
                      Head Script
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="headScript"
                        placeholder="**********"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="googleTagManager.bodyScript"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="bodyScript"
                    >
                      Body Script
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="bodyScript"
                        placeholder="**********"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isSettingsLoading || isFetching || isUpdating}
                >
                  {isUpdating ? 'Saving Changes...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </>
  );
};

export default SeoSettings;
