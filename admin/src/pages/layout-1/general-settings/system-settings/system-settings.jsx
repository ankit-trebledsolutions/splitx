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

const SystemSettings = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('system');
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
      miscellaneous: {
        itemsPerPage: 10,
        activeSubscription: true,
        activeFreeTrial: false,
        enableSubscriptionPlan: true,
        maximumPractitionerRequests: 4,
      },
      newAccount: {
        activateMandatoryAdmin: false,
        activateEmailVerification: false,
        activateAutoLogin: true,
        activateWelcomeMail: true,
      },
      notifications: {
        unreadMessageEmail: false,
        unreadMailDuration: 10,
        durationToDeleteAttachment: 30,
      },
      rememberSecurity: {
        rememberDaysAdmin: 30,
        rememberSecurityAdmin: 'moderate',
        rememberDaysUser: 30,
        rememberSecurityUser: 'moderate',
      },
    },
  });

  const onSubmit = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'system', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  useEffect(() => {
    if (settings?.system) {
      form.reset(settings.system);
    }
  }, [settings, form]);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Google Analytics */}
          <Card>
            <CardHeader>
              <CardTitle>System</CardTitle>
              <CardDescription>Manage your system settings</CardDescription>
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
              <div className="grid gap-5">
                <CardTitle>1. Miscellaneous</CardTitle>
                <FormField
                  control={form.control}
                  name="miscellaneous.itemsPerPage"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="itemsPerPage"
                      >
                        Default items per page
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="itemsPerPage"
                          type="number"
                          placeholder="Enter items per page"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="miscellaneous.activeSubscription"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Active Subscription</FormLabel>
                        <CardDescription>
                          functionality works on the system only when this
                          setting is enabled.
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
                <FormField
                  control={form.control}
                  name="miscellaneous.activeFreeTrial"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Active Free Trial</FormLabel>
                        <CardDescription>
                          Practitioners can offer free trial sessions to the
                          clients only when this setting is enabled.
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
                <FormField
                  control={form.control}
                  name="miscellaneous.enableSubscriptionPlan"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>Enable Subscription Plan</FormLabel>
                        <CardDescription className="text-destructive">
                          Settings can't be reverted once enabled
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
                <FormField
                  control={form.control}
                  name="miscellaneous.maximumPractitionerRequests"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="maximumPractitionerRequests"
                      >
                        Maximum practitioner requests per user
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="maximumPractitionerRequests"
                          type="number"
                          placeholder="Enter maximum practitioner requests"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
              </div>
              <Separator />
              <div className="grid gap-5">
                <CardTitle>2. New Account</CardTitle>
                <FormField
                  control={form.control}
                  name="newAccount.activateMandatoryAdmin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>
                          Activate mandatory admin approval on new user signup.
                        </FormLabel>
                        <CardDescription>
                          On enabling this feature, admin need to approve each
                          user after registration
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
                <FormField
                  control={form.control}
                  name="newAccount.activateEmailVerification"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>
                          Activate email verification after registration
                        </FormLabel>
                        <CardDescription>
                          new users (clients and practitioners) are required to
                          verify the email address
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
                <FormField
                  control={form.control}
                  name="newAccount.activateAutoLogin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>
                          Activate auto login after registration
                        </FormLabel>
                        <CardDescription>
                          When selected, new users are automatically logged into
                          their account
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
                <FormField
                  control={form.control}
                  name="newAccount.activateWelcomeMail"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>
                          Activate sending welcome mail after registration
                        </FormLabel>
                        <CardDescription>
                          When selected, new users receive a welcome email after
                          registration
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
              </div>
              <Separator />
              <div className="grid gap-5">
                <CardTitle>3. Notifications</CardTitle>
                <FormField
                  control={form.control}
                  name="notifications.unreadMailDuration"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-100"
                        htmlFor="unreadMailDuration"
                      >
                        Unread messages email sent after duration [in minutes]
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="unreadMailDuration"
                          type="number"
                          placeholder="Enter duration"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notifications.durationToDeleteAttachment"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-100"
                        htmlFor="durationToDeleteAttachment"
                      >
                        Duration allowed to delete an attachment [in minutes]
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="durationToDeleteAttachment"
                          type="number"
                          placeholder="Enter delete attachments"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notifications.unreadMessageEmail"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel>
                          Send email notifications for unread messages
                        </FormLabel>
                        <CardDescription>
                          Email sent to users notifying them about unread
                          messages in their account.
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
              </div>
              <Separator />
              <div className="grid gap-5">
                <CardTitle>4. Remember me security</CardTitle>
                <FormField
                  control={form.control}
                  name="rememberSecurity.rememberDaysAdmin"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="rememberDaysAdmin"
                      >
                        Remember me days for admin
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="rememberDaysAdmin"
                          type="number"
                          placeholder="Enter remember me days for admin"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rememberSecurity.rememberSecurityAdmin"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="rememberSecurityAdmin"
                      >
                        Remember me security for admin
                      </FormLabel>
                      <FormControl>
                        <Select
                          id="rememberSecurityAdmin"
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select remember me security" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rememberSecurity.rememberDaysUser"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="rememberDaysUser"
                      >
                        Remember me days for user
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="rememberDaysUser"
                          type="number"
                          placeholder="Enter remember me days for user"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rememberSecurity.rememberSecurityUser"
                  render={({ field }) => (
                    <div className="flex flex-wrap lg:flex-nowrap gap-2.5">
                      <FormLabel
                        className="flex w-full items-center gap-1 max-w-56"
                        htmlFor="rememberSecurityUser"
                      >
                        Remember me security for user
                      </FormLabel>
                      <FormControl>
                        <Select
                          id="rememberSecurityUser"
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select remember me security" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </div>
                  )}
                />
              </div>
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

export default SystemSettings;
