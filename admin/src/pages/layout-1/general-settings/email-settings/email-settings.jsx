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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const EmailSettings = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('email');
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
      formEmail: '',
      sendEmail: false,
      contactEmail: '',
      sendSmtpEmail: false,
      smtpHost: '',
      smtpPort: 587,
      smtpUsername: '',
      smtpPassword: '',
      smtpSecure: 'tls',
    },
  });

  const onSubmit = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'email', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  useEffect(() => {
    if (settings?.email) {
      form.reset({
        formEmail: settings.email.formEmail || '',
        sendEmail: settings.email.sendEmail || false,
        contactEmail: settings.email.contactEmail || '',
        sendSmtpEmail: settings.email.sendSmtpEmail || false,
        smtpHost: settings.email.smtpHost || '',
        smtpPort: settings.email.smtpPort || 587,
        smtpUsername: settings.email.smtpUsername || '',
        smtpPassword: settings.email.smtpPassword || '',
        smtpSecure: settings.email.smtpSecure || 'tls',
      });
    }
  }, [settings, form]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email</CardTitle>
              <CardDescription>Manage your email settings</CardDescription>
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
              <FormField
                control={form.control}
                name="sendEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>Send Email</FormLabel>
                      <CardDescription>
                        Enable or disable email sending functionality
                      </CardDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-500"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sendSmtpEmail"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>Send SMTP Email</FormLabel>
                      <CardDescription>
                        Enable or disable SMTP email sending functionality
                      </CardDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-500 "
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Separator />
              <FormField
                control={form.control}
                name="formEmail"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="formEmail"
                    >
                      From Email
                    </FormLabel>
                    <FormControl>
                      <Input id="formEmail" {...field} />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />
              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="contactEmail"
                    >
                      Contact Email
                    </FormLabel>
                    <FormControl>
                      <Input id="contactEmail" {...field} />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="smtpHost"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="smtpHost"
                    >
                      SMTP Host
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="smtpHost"
                        placeholder="smtp.example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="smtpPort"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="smtpPort"
                    >
                      SMTP Port
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="smtpPort"
                        type="number"
                        placeholder="587"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="smtpUsername"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="smtpUsername"
                    >
                      SMTP Username
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="smtpUsername"
                        placeholder="username"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="smtpPassword"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="smtpPassword"
                    >
                      SMTP Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="smtpPassword"
                        type="password"
                        placeholder="password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              />

              <FormField
                control={form.control}
                name="smtpSecure"
                render={({ field }) => (
                  <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
                    <FormLabel
                      className="flex w-full items-center gap-1 max-w-56"
                      htmlFor="smtpSecure"
                    >
                      SMTP Secure
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a secure option" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </div>
                )}
              />
              <div className="flex justify-end">
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

export default EmailSettings;
