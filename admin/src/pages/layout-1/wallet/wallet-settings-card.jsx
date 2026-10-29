import { Fragment, useEffect, useMemo } from 'react';
import { AlertCircle, Info, Lock, RotateCcw, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { isSuperAdmin } from '@/lib/permissions';
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
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import {
  useGetWalletSettingsQuery,
  useUpdateWalletSettingsMutation,
} from '@/features/wallet/walletApi';
import {
  formatCredits,
  formatWhen,
  plural,
} from '@/features/wallet/walletLabels';

// The ranges are the server's (walletSettingsSchema in
// backend/src/routes/admin.routes.js); checking them here only saves a trip.
const SECTIONS = [
  {
    key: 'prices',
    title: 'Prices',
    fields: [
      {
        name: 'aiItinerary',
        label: 'AI itinerary plan',
        unit: 'credits',
        min: 0,
        max: 10000,
        price: true,
        help: () =>
          'Charged for each AI itinerary plan someone asks for. A plan that fails is refunded automatically. 0 = free.',
      },
      {
        name: 'callBlock',
        label: 'Group call',
        unit: 'credits',
        min: 0,
        max: 10000,
        price: true,
        help: (values) => {
          const minutes = Number(values.callBlockMinutes) || 0;
          const block =
            minutes > 0
              ? `${minutes} ${plural(minutes, 'minute', 'minutes')}`
              : 'the block length';
          return `Charged to whoever starts a group call, once for every started block of ${block}. 0 = free.`;
        },
      },
      {
        name: 'callBlockMinutes',
        label: 'Call block length',
        unit: 'minutes',
        min: 1,
        max: 60,
        help: () =>
          'How long one call charge lasts. With 10-minute blocks, a 25-minute call is charged 3 times.',
      },
    ],
  },
  {
    key: 'allowances',
    title: 'Allowances',
    fields: [
      {
        name: 'signupBonus',
        label: 'Signup bonus',
        unit: 'credits',
        min: 0,
        max: 100000,
        help: () =>
          'Given once to each account when its wallet is opened. These are paid credits, so they never expire. Wallets that already exist keep what they got.',
      },
      {
        name: 'monthlyFree',
        label: 'Free credits each month',
        unit: 'credits',
        min: 0,
        max: 100000,
        help: () =>
          "At the start of every month (UTC), each person's free credits are reset to this. They are spent before paid credits and do not carry over.",
      },
      {
        name: 'coAdminGrantCap',
        label: 'Co-admin limit',
        unit: 'credits',
        min: 0,
        max: 1000000,
        help: () =>
          'The most a co-admin can grant or deduct at one time. Owners have no limit.',
      },
    ],
  },
];

const FIELDS = SECTIONS.flatMap((section) => section.fields);

// The form holds text, as inputs do; the server takes whole numbers.
const toFormValues = (settings) => ({
  aiItinerary: String(settings?.prices?.aiItinerary ?? 0),
  callBlock: String(settings?.prices?.callBlock ?? 0),
  callBlockMinutes: String(settings?.callBlockMinutes ?? 10),
  signupBonus: String(settings?.signupBonus ?? 0),
  monthlyFree: String(settings?.monthlyFree ?? 0),
  coAdminGrantCap: String(settings?.coAdminGrantCap ?? 0),
});

const toBody = (values) => ({
  prices: {
    aiItinerary: Number(values.aiItinerary),
    callBlock: Number(values.callBlock),
  },
  callBlockMinutes: Number(values.callBlockMinutes),
  signupBonus: Number(values.signupBonus),
  monthlyFree: Number(values.monthlyFree),
  coAdminGrantCap: Number(values.coAdminGrantCap),
});

const wholeNumberIn = (field) => (raw) => {
  const text = String(raw ?? '').trim();
  if (text === '') return 'Enter a number';
  if (!/^\d+$/.test(text)) return 'Enter a whole number, with no decimals';
  const number = Number(text);
  if (number < field.min || number > field.max) {
    return `Enter a number from ${formatCredits(field.min)} to ${formatCredits(field.max)}`;
  }
  return true;
};

// Beside a price's label, so "0 = free" is seen and not only read.
const PriceBadge = ({ value }) =>
  Number(value) === 0 ? (
    <Badge variant="success" appearance="light" size="sm">
      Free
    </Badge>
  ) : (
    <Badge variant="primary" appearance="light" size="sm">
      Charged
    </Badge>
  );

const valueInWords = (field, value) => {
  const number = Number(value) || 0;
  if (field.price && number === 0) return 'Free';
  if (field.unit === 'minutes') {
    return `${formatCredits(number)} ${plural(number, 'minute', 'minutes')}`;
  }
  return `${formatCredits(number)} ${plural(number, 'credit', 'credits')}`;
};

const ChargingOff = () => (
  <Alert variant="info" appearance="light" size="sm">
    <AlertIcon>
      <Info />
    </AlertIcon>
    <AlertContent>
      <AlertTitle>Charging is off</AlertTitle>
      <AlertDescription>
        Both prices are 0, so AI plans and group calls are free for everyone.
        Nothing is charged until a price is set here.
      </AlertDescription>
    </AlertContent>
  </Alert>
);

// What a co-admin sees: the same figures, in words, with nothing to change.
const ReadOnlyView = ({ values }) => (
  <div className="flex flex-col gap-5">
    <Alert variant="secondary" appearance="light" size="sm">
      <AlertIcon>
        <Lock />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>Read only</AlertTitle>
        <AlertDescription>
          Only an owner can change prices and allowances.
        </AlertDescription>
      </AlertContent>
    </Alert>
    {SECTIONS.map((section, index) => (
      <Fragment key={section.key}>
        {index > 0 ? <Separator /> : null}
        <div className="flex flex-col gap-4">
          <div className="text-mono text-sm font-semibold">{section.title}</div>
          {section.key === 'prices' &&
          Number(values.aiItinerary) === 0 &&
          Number(values.callBlock) === 0 ? (
            <ChargingOff />
          ) : null}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {section.fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1">
                <div className="text-sm text-secondary-foreground">
                  {field.label}
                </div>
                <div className="text-mono text-lg font-semibold">
                  {valueInWords(field, values[field.name])}
                </div>
                <p className="text-xs text-muted-foreground">
                  {field.help(values)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Fragment>
    ))}
  </div>
);

const NumberField = ({ form, field, values, disabled }) => (
  <FormField
    control={form.control}
    name={field.name}
    rules={{ validate: wholeNumberIn(field) }}
    render={({ field: input }) => (
      <FormItem>
        <FormLabel className="flex items-center gap-2">
          {field.label}
          {field.price ? <PriceBadge value={values[field.name]} /> : null}
        </FormLabel>
        <InputGroup>
          <FormControl>
            <Input
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={1}
              {...input}
              disabled={disabled}
            />
          </FormControl>
          <InputAddon>{field.unit}</InputAddon>
        </InputGroup>
        <FormDescription>{field.help(values)}</FormDescription>
        <FormMessage />
      </FormItem>
    )}
  />
);

/**
 * What features cost and what everyone is given. A change applies to the very
 * next charge, on every server, with nothing to restart. Owners only: anyone
 * else sees the figures without the form.
 */
export default function WalletSettingsCard() {
  const currentUser = useAppSelector(selectCurrentUser);
  const canEdit = isSuperAdmin(currentUser);
  const { data: settings, isLoading, error } = useGetWalletSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] =
    useUpdateWalletSettingsMutation();

  const saved = useMemo(() => toFormValues(settings), [settings]);
  const form = useForm({ defaultValues: saved });
  const values = form.watch();
  const { isDirty } = form.formState;

  // What is saved changed (first load, a save): start again from it.
  useEffect(() => {
    form.reset(saved);
  }, [saved, form]);

  const onSubmit = async (submitted) => {
    try {
      const next = await updateSettings(toBody(submitted)).unwrap();
      form.reset(toFormValues(next));
      toast.success('Prices and allowances saved. They apply from now on.');
    } catch (err) {
      toast.error(
        errorMessage(err, 'The prices and allowances could not be saved'),
      );
    }
  };

  return (
    <Card>
      <CardHeader className="py-4">
        <CardHeading>
          <CardTitle>Prices & allowances</CardTitle>
          <CardDescription>
            {settings?.updatedAt
              ? `Last changed ${formatWhen(settings.updatedAt)}.`
              : 'Never changed: these are the starting values.'}{' '}
            A change applies to the very next charge.
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
                {errorMessage(
                  error,
                  'The prices and allowances could not be loaded.',
                )}
              </AlertDescription>
            </AlertContent>
          </Alert>
        </CardContent>
      ) : isLoading ? (
        <CardContent className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3 lg:p-7.5">
          {FIELDS.map((field) => (
            <div key={field.name} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8.5 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      ) : !canEdit ? (
        <CardContent className="p-5 lg:p-7.5">
          <ReadOnlyView values={saved} />
        </CardContent>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5">
              {SECTIONS.map((section, index) => (
                <Fragment key={section.key}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex flex-col gap-4">
                    <div className="text-mono text-sm font-semibold">
                      {section.title}
                    </div>
                    {section.key === 'prices' &&
                    Number(saved.aiItinerary) === 0 &&
                    Number(saved.callBlock) === 0 ? (
                      <ChargingOff />
                    ) : null}
                    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
                      {section.fields.map((field) => (
                        <NumberField
                          key={field.name}
                          form={form}
                          field={field}
                          values={values}
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
  );
}
