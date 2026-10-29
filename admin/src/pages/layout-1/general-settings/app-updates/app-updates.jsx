import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, RotateCcw, Save } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input, InputAddon, InputGroup } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useGetAppReleaseQuery,
  useUpdateAppReleaseMutation,
} from '@/features/app-release/appReleaseApi';
import { formatWhen } from '@/features/support/supportLabels';
import LockOutDialog from './lock-out-dialog';

/**
 * Force update. Every build of the app has a number that goes up with each
 * release (Android's versionCode). The app sends its number with every
 * request, and the server turns away any build below "lowest allowed build"
 * with an update screen the person cannot dismiss, whose only button opens
 * the download link.
 *
 * The usual rhythm: a new APK goes up, "latest build" and the link are set,
 * and people are told once that an update is waiting. Only when an old
 * build would actually break against the server is "lowest allowed build"
 * raised too. Builds from before the app sent its number cannot be forced.
 */
const PLATFORMS = [
  {
    key: 'android',
    title: 'Android',
    hint: 'The build number is versionCode in mobile/app.json. It goes up by one with every APK that goes out.',
  },
  {
    key: 'ios',
    title: 'iOS',
    hint: 'Splix is not on iPhone yet. Left at 0, nothing is forced there.',
  },
];

// The ranges and rules are the server's (appReleaseSchema in
// backend/src/routes/admin.routes.js); checking them here only saves a trip.
const MAX_BUILD = 1000000000;

const FIELDS = [
  {
    name: 'minBuild',
    label: 'Lowest allowed build',
    kind: 'build',
    help: 'Phones on a build below this are locked behind an update screen from their very next tap, until they install a newer build. 0 = nobody is forced.',
  },
  {
    name: 'latestBuild',
    label: 'Latest build',
    kind: 'build',
    help: 'The build number of the newest APK. Phones below it are told once that an update is waiting, and can carry on.',
  },
  {
    name: 'latestVersion',
    label: 'Version label',
    kind: 'text',
    placeholder: '1.2.0',
    help: 'What people see on the update screen. Not compared: only the build numbers are.',
  },
  {
    name: 'downloadUrl',
    label: 'Download link',
    kind: 'url',
    placeholder: 'https://',
    help: 'Where "Update now" takes people: the APK\'s link for now, the Play Store page once Splix is listed. Needed before a build can be required.',
  },
  {
    name: 'notes',
    label: "What's new",
    kind: 'notes',
    placeholder: 'Optional. Shown on the update screen.',
    help: '',
  },
];

const EMPTY = { minBuild: '0', latestBuild: '0', latestVersion: '', downloadUrl: '', notes: '' };

// The form holds text, as inputs do; the server takes whole numbers.
const toPlatformValues = (saved) => ({
  minBuild: String(saved?.minBuild ?? 0),
  latestBuild: String(saved?.latestBuild ?? 0),
  latestVersion: saved?.latestVersion ?? '',
  downloadUrl: saved?.downloadUrl ?? '',
  notes: saved?.notes ?? '',
});

const toFormValues = (settings) =>
  Object.fromEntries(
    PLATFORMS.map((p) => [p.key, settings ? toPlatformValues(settings[p.key]) : { ...EMPTY }]),
  );

const toPlatformBody = (values) => ({
  minBuild: Number(values.minBuild),
  latestBuild: Number(values.latestBuild),
  latestVersion: values.latestVersion.trim(),
  downloadUrl: values.downloadUrl.trim(),
  notes: values.notes.trim(),
});

const toBody = (values) =>
  Object.fromEntries(PLATFORMS.map((p) => [p.key, toPlatformBody(values[p.key])]));

const wholeNumber = (raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return 'Enter a number';
  if (!/^\d+$/.test(text)) return 'Enter a whole number, with no decimals';
  if (Number(text) > MAX_BUILD) return `Enter a number up to ${MAX_BUILD}`;
  return true;
};

// Cross-field rules, written against the whole form so each message lands
// under the field the person has to change.
const rulesFor = (platform, field) => ({
  validate: (value, all) => {
    const own = all[platform] ?? {};
    switch (field.name) {
      case 'minBuild': {
        const ok = wholeNumber(value);
        if (ok !== true) return ok;
        if (wholeNumber(own.latestBuild) === true && Number(value) > Number(own.latestBuild)) {
          return 'The lowest allowed build cannot be above the latest build';
        }
        return true;
      }
      case 'latestBuild':
        return wholeNumber(value);
      case 'latestVersion':
        return String(value).trim().length <= 32 || 'At most 32 characters';
      case 'downloadUrl': {
        const url = String(value).trim();
        if (url.length > 500) return 'At most 500 characters';
        if (url !== '' && !/^https:\/\/\S+$/i.test(url)) return 'The link must start with https://';
        if (url === '' && Number(own.minBuild) > 0) return 'Add a download link before requiring a build';
        return true;
      }
      case 'notes':
        return String(value).trim().length <= 1000 || 'At most 1000 characters';
      default:
        return true;
    }
  },
});

// Beside a platform's title: what is in force right now, from the saved values.
const ForceBadge = ({ saved }) => {
  const minBuild = Number(saved?.minBuild) || 0;
  return minBuild > 0 ? (
    <Badge variant="destructive" appearance="light" size="sm">
      Builds below {minBuild} locked out
    </Badge>
  ) : (
    <Badge variant="success" appearance="light" size="sm">
      Nobody is forced
    </Badge>
  );
};

const HowItWorks = () => (
  <Alert variant="info" appearance="light" size="sm">
    <AlertIcon>
      <Info />
    </AlertIcon>
    <AlertContent>
      <AlertTitle>How a release goes</AlertTitle>
      <AlertDescription>
        Build the new APK with a higher build number, put it at the download
        link, then set “Latest build” to that number: people are told once
        that an update is waiting. Raise “Lowest allowed build” only when the
        old app would no longer work with the server. Phones on a build from
        before the app sent its number cannot be forced.
      </AlertDescription>
    </AlertContent>
  </Alert>
);

const Field = ({ form, platform, field, disabled }) => (
  <FormField
    control={form.control}
    name={`${platform}.${field.name}`}
    rules={rulesFor(platform, field)}
    render={({ field: input }) => (
      <FormItem className={field.kind === 'notes' ? 'lg:col-span-2' : undefined}>
        <FormLabel>{field.label}</FormLabel>
        {field.kind === 'build' ? (
          <InputGroup>
            <FormControl>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_BUILD}
                step={1}
                {...input}
                disabled={disabled}
              />
            </FormControl>
            <InputAddon>build</InputAddon>
          </InputGroup>
        ) : field.kind === 'notes' ? (
          <FormControl>
            <Textarea rows={3} placeholder={field.placeholder} {...input} disabled={disabled} />
          </FormControl>
        ) : (
          <FormControl>
            <Input
              type={field.kind === 'url' ? 'url' : 'text'}
              placeholder={field.placeholder}
              {...input}
              disabled={disabled}
            />
          </FormControl>
        )}
        {field.help ? <FormDescription>{field.help}</FormDescription> : null}
        <FormMessage />
      </FormItem>
    )}
  />
);

export default function AppUpdates() {
  const { data: settings, isLoading, error } = useGetAppReleaseQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateAppReleaseMutation();

  const saved = useMemo(() => toFormValues(settings), [settings]);
  const form = useForm({ defaultValues: saved, mode: 'onBlur' });
  const { isDirty } = form.formState;

  // The lock-out confirmation, holding the body it is asked about.
  const [pending, setPending] = useState(null);

  // What is saved changed (first load, a save): start again from it.
  useEffect(() => {
    form.reset(saved);
  }, [saved, form]);

  const save = async (body) => {
    try {
      const next = await updateSettings(body).unwrap();
      form.reset(toFormValues(next));
      setPending(null);
      toast.success('App update settings saved. They apply from now on.');
    } catch (err) {
      toast.error(errorMessage(err, 'The app update settings could not be saved'));
    }
  };

  const onSubmit = (submitted) => {
    const body = toBody(submitted);
    // Raising a minimum shuts people out at once: said in full, then confirmed.
    const raising = PLATFORMS.filter(
      (p) => body[p.key].minBuild > (Number(saved[p.key].minBuild) || 0),
    ).map((p) => ({
      title: p.title,
      minBuild: body[p.key].minBuild,
      downloadUrl: body[p.key].downloadUrl,
    }));
    if (raising.length) {
      setPending({ body, raising });
      return undefined;
    }
    return save(body);
  };

  return (
    <>
      <Helmet>
        <title>App Updates - Splix Admin</title>
      </Helmet>

      <Card>
        <CardHeader className="py-4">
          <CardHeading>
            <CardTitle>App updates</CardTitle>
            <CardDescription>
              {settings?.updatedAt
                ? `Last changed ${formatWhen(settings.updatedAt)}.`
                : 'Never changed: nothing is forced.'}{' '}
              Which builds of the app may still be used, and where the newest
              one is. A change applies to the very next request from every
              phone.
            </CardDescription>
          </CardHeading>
        </CardHeader>

        {error ? (
          <CardContent className="p-5 lg:p-7.5">
            <Alert variant="destructive" appearance="light" size="md">
              <AlertIcon>
                <AlertCircle />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {errorMessage(error, 'The app update settings could not be loaded.')}
                </AlertDescription>
              </AlertContent>
            </Alert>
          </CardContent>
        ) : isLoading ? (
          <CardContent className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2 lg:p-7.5">
            {FIELDS.map((field) => (
              <div key={field.name} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8.5 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </CardContent>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5">
                <HowItWorks />
                {PLATFORMS.map((platform, index) => (
                  <Fragment key={platform.key}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-mono text-sm font-semibold">{platform.title}</div>
                        <ForceBadge saved={saved[platform.key]} />
                      </div>
                      <p className="text-xs text-muted-foreground">{platform.hint}</p>
                      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                        {FIELDS.map((field) => (
                          <Field
                            key={field.name}
                            form={form}
                            platform={platform.key}
                            field={field}
                            disabled={isSaving}
                          />
                        ))}
                      </div>
                    </div>
                  </Fragment>
                ))}
              </CardContent>
              <CardFooter className="justify-end gap-2.5 px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!isDirty || isSaving}
                  onClick={() => form.reset(saved)}
                >
                  <RotateCcw />
                  Undo changes
                </Button>
                <Button type="submit" disabled={!isDirty || isSaving}>
                  <Save />
                  {isSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        )}
      </Card>

      <LockOutDialog
        changes={pending?.raising ?? []}
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPending(null);
        }}
        onConfirm={() => pending && save(pending.body)}
        isSaving={isSaving}
      />
    </>
  );
}
