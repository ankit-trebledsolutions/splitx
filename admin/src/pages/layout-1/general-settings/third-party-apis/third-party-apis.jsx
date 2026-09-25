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
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const ThirdPartyApis = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('thirdPartyApis');
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
      googleAnalytics: {
        enabled: false,
        propertyId: '',
        clientJson: '',
      },
      googleMaps: {
        enabled: false,
        apiKey: '',
      },
      firebase: {
        enabled: false,
        serviceAccountJson: '',
      },
      microsoftTextTranslator: {
        enabled: false,
        subscriptionKey: '',
        subscriptionRegion: '',
      },
      googleRecaptcha: {
        enabled: false,
        siteKey: '',
        secretKey: '',
      },
    },
  });

  const onSubmit = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'thirdPartyApis', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  useEffect(() => {
    if (settings?.thirdPartyApis) {
      form.reset(settings.thirdPartyApis);
    }
  }, [settings, form]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Google Analytics */}
          <Card>
            <CardHeader>
              <CardTitle>Manage APIs</CardTitle>
              <CardDescription>
                Manage your third-party API integrations
              </CardDescription>
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
                <CardTitle>1. Google Analytics</CardTitle>
                <FormField
                  control={form.control}
                  name="googleAnalytics.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Allow for changes in fields
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
                name="googleAnalytics.propertyId"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="propertyId"
                    >
                      Property ID
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="propertyId"
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('googleAnalytics.enabled')}
                        className={
                          !form.watch('googleAnalytics.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <FormField
                control={form.control}
                name="googleAnalytics.clientJson"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="clientJson"
                    >
                      Client JSON
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="clientJson"
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('googleAnalytics.enabled')}
                        className={
                          !form.watch('googleAnalytics.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <Separator />
              {/* Google Maps */}
              <div className="flex justify-between">
                <CardTitle>2. Google Maps</CardTitle>
                <FormField
                  control={form.control}
                  name="googleMaps.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Allow for changes in fields
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
                name="googleMaps.apiKey"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="apiKey"
                    >
                      API Key
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="apiKey"
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('googleMaps.enabled')}
                        className={
                          !form.watch('googleMaps.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <Separator />

              {/* Firebase Configuration */}
              <div className="flex justify-between">
                <CardTitle>3. Firebase</CardTitle>
                <FormField
                  control={form.control}
                  name="firebase.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Allow for changes in fields
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
                name="firebase.serviceAccountJson"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel className="flex w-full items-center gap-1 max-w-56">
                      Service Account Json For Firebase
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('firebase.enabled')}
                        className={
                          !form.watch('firebase.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <Separator />

              {/* Microsoft Text Translator */}
              <div className="flex justify-between">
                <CardTitle>4. Microsoft Text Translator</CardTitle>
                <FormField
                  control={form.control}
                  name="microsoftTextTranslator.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Allow for changes in fields
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
                name="microsoftTextTranslator.subscriptionKey"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="subscriptionKey"
                    >
                      Subscription key
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="subscriptionKey"
                        placeholder="**********"
                        {...field}
                        disabled={
                          !form.watch('microsoftTextTranslator.enabled')
                        }
                        className={
                          !form.watch('microsoftTextTranslator.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <FormField
                control={form.control}
                name="microsoftTextTranslator.subscriptionRegion"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="subscriptionRegion"
                    >
                      Subscription Region
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="subscriptionRegion"
                        placeholder="**********"
                        {...field}
                        disabled={
                          !form.watch('microsoftTextTranslator.enabled')
                        }
                        className={
                          !form.watch('microsoftTextTranslator.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <Separator />

              {/* Google reCAPTCHA */}

              <div className="flex justify-between">
                <CardTitle>5. Google reCAPTCHA</CardTitle>
                <FormField
                  control={form.control}
                  name="googleRecaptcha.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center">
                      <div className="space-y-0.5">
                        <CardDescription>
                          Allow for changes in fields
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
                name="googleRecaptcha.siteKey"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="siteKey"
                    >
                      Site Key
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="siteKey"
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('googleRecaptcha.enabled')}
                        className={
                          !form.watch('googleRecaptcha.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <FormField
                control={form.control}
                name="googleRecaptcha.secretKey"
                render={({ field }) => (
                  <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="secretKey"
                    >
                      Secret Key
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="secretKey"
                        placeholder="**********"
                        {...field}
                        disabled={!form.watch('googleRecaptcha.enabled')}
                        className={
                          !form.watch('googleRecaptcha.enabled')
                            ? 'cursor-not-allowed opacity-50'
                            : ''
                        }
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

export default ThirdPartyApis;
