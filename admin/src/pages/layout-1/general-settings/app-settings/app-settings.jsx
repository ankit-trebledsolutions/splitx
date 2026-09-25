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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const selectValueMaps = {
  language: {
    en: 'en',
    english: 'en',
    es: 'es',
    spanish: 'es',
    ar: 'ar',
    arabic: 'ar',
  },
  currency: {
    inr: 'INR',
    'indian rupee': 'INR',
    usd: 'USD',
    'us dollar': 'USD',
    eur: 'EUR',
    euro: 'EUR',
  },
  country: {
    in: 'IN',
    india: 'IN',
    us: 'US',
    'united states': 'US',
    gb: 'GB',
    'united kingdom': 'GB',
  },
  timeFormat: {
    '12h': '12h',
    '12-hour': '12h',
    '12-hour (am/pm)': '12h',
    '24h': '24h',
    '24-hour': '24h',
  },
};

const normalizeSelectValue = (field, value) => {
  if (!value) return '';
  return selectValueMaps[field][String(value).trim().toLowerCase()] || value;
};

const AppSettings = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('app');
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
      appName: '',
      ownerEmail: '',
      telephone: '',
      language: '',
      currency: '',
      country: '',
      timeFormat: '',
      appDescription: '',
    },
  });

  // Update form when data are loaded
  useEffect(() => {
    if (data?.app) {
      form.reset({
        appName: data.app.appName || '',
        ownerEmail: data.app.ownerEmail || '',
        telephone: data.app.telephone || '',
        language: normalizeSelectValue('language', data.app.language),
        currency: normalizeSelectValue('currency', data.app.currency),
        country: normalizeSelectValue('country', data.app.country),
        timeFormat: normalizeSelectValue('timeFormat', data.app.timeFormat),
        appDescription: data.app.appDescription || '',
      });
    }
  }, [data, form]);

  const onSubmit = async (inpData) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'app', data: inpData }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application</CardTitle>
              <CardDescription>Manage your app settings</CardDescription>
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

              {/* App Name */}
              <FormField
                control={form.control}
                name="appName"
                rules={{
                  required: 'App Name is required',
                  minLength: {
                    value: 3,
                    message: 'App Name must be at least 3 characters',
                  },
                  maxLength: {
                    value: 50,
                    message: 'App Name cannot exceed 50 characters',
                  },
                }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="appName"
                    >
                      App Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="appName"
                        placeholder="Enter application name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Site Owner's Email */}
              <FormField
                control={form.control}
                name="ownerEmail"
                rules={{
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Please enter a valid email',
                  },
                }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="ownerEmail"
                    >
                      Site Owner's Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="ownerEmail"
                        type="email"
                        placeholder="owner@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Telephone Number */}
              <FormField
                control={form.control}
                name="telephone"
                rules={{
                  required: 'Telephone Number is required',
                  pattern: {
                    value: /^[\+]?[1-9]\d{1,3}?[-\s]?\d{1,4}[-\s]?\d{1,4}$/,
                    message: 'Please enter a valid phone number',
                  },
                }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="telephone"
                    >
                      Telephone Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="telephone"
                        placeholder="+1 (555) 123-4567"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Site Language */}
              <FormField
                control={form.control}
                name="language"
                rules={{ required: 'Language is required' }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="language"
                    >
                      Site Language
                    </FormLabel>
                    <FormControl>
                      <Select
                        id="language"
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="ar">Arabic</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Site Currency */}
              <FormField
                control={form.control}
                name="currency"
                rules={{ required: 'Currency is required' }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="currency"
                    >
                      Site Currency
                    </FormLabel>
                    <FormControl>
                      <Select
                        id="currency"
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD - US Dollar</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="INR">
                            INR - Indian Rupee
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Site Country */}
              <FormField
                control={form.control}
                name="country"
                rules={{ required: 'Country is required' }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="country"
                    >
                      Site Country
                    </FormLabel>
                    <FormControl>
                      <Select
                        id="country"
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">United States</SelectItem>
                          <SelectItem value="GB">United Kingdom</SelectItem>
                          <SelectItem value="IN">India</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* Site Time Format */}
              <FormField
                control={form.control}
                name="timeFormat"
                rules={{ required: 'Time Format is required' }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="timeFormat"
                    >
                      Site Time Format
                    </FormLabel>
                    <FormControl>
                      <Select
                        id="timeFormat"
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select time format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                          <SelectItem value="24h">24-hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              {/* App Description */}
              <FormField
                control={form.control}
                name="appDescription"
                rules={{
                  required: 'Description is required',
                  minLength: {
                    value: 10,
                    message: 'Description must be at least 10 characters',
                  },
                  maxLength: {
                    value: 500,
                    message: 'Description cannot exceed 500 characters',
                  },
                }}
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="appDescription"
                    >
                      App Description
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="appDescription"
                        placeholder="Enter application description..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <div className="flex justify-end pt-2.5">
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

export default AppSettings;
