import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  PlugZap,
  RotateCcw,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  useResetIntegrationMutation,
  useTestIntegrationMutation,
  useUpdateIntegrationMutation,
} from '@/features/integrations/integrationsApi';
import ConfirmPasswordDialog from './confirm-password-dialog';

// A secret's box always starts empty: the key in use is never sent here.
const startingValues = (integration) =>
  Object.fromEntries(
    integration.fields.map((field) => [
      field.key,
      field.type === 'secret' ? '' : (field.value ?? ''),
    ]),
  );

// Only what was typed or changed. An empty box means "leave it as it is".
const changedValues = (integration, values) =>
  Object.fromEntries(
    integration.fields
      .map((field) => [field.key, String(values[field.key] ?? '').trim()])
      .filter(([key, value]) => {
        const field = integration.fields.find((entry) => entry.key === key);
        if (value === '') return false;
        return field.type === 'secret' || value !== String(field.value ?? '');
      }),
  );

const StatusBadge = ({ integration }) => {
  if (integration.needsAttention) {
    return (
      <Badge variant="warning" appearance="light">
        Needs attention
      </Badge>
    );
  }
  if (!integration.isConfigured) {
    return (
      <Badge variant="destructive" appearance="light">
        Not set up
      </Badge>
    );
  }
  return integration.isCustomized ? (
    <Badge variant="success" appearance="light">
      Set in this panel
    </Badge>
  ) : (
    <Badge variant="secondary" appearance="light">
      Server default
    </Badge>
  );
};

// What is in use for a field, in words. Never the value of a secret.
const inUse = (field) => {
  if (field.unreadable) {
    return {
      tone: 'text-destructive',
      text: 'The key saved here can no longer be read. Enter it again.',
    };
  }
  if (field.notInUse) {
    return {
      tone: 'text-destructive',
      text: 'Saved here, but not in use until the key that can no longer be read is entered again.',
    };
  }
  const where = { panel: 'saved in this panel', server: 'set on the server' }[
    field.source
  ];
  if (!where) return { tone: 'text-muted-foreground', text: 'Not set yet.' };

  if (field.type === 'secret') {
    return {
      tone: 'text-muted-foreground',
      text: field.hint
        ? `In use: a key ending in ${field.hint}, ${where}. Leave empty to keep it.`
        : `In use: a key ${where}. Leave empty to keep it.`,
    };
  }
  return {
    tone: 'text-muted-foreground',
    text: `${field.help ? `${field.help} ` : ''}In use: ${where}.${
      field.alsoAccepted
        ? ` Also accepted: ${field.alsoAccepted}, set on the server.`
        : ''
    }`,
  };
};

const FieldRow = ({ form, field, integrationKey, disabled }) => {
  const [visible, setVisible] = useState(false);
  const id = `${integrationKey}-${field.key}`;
  const status = inUse(field);
  const secret = field.type === 'secret';

  return (
    <FormField
      control={form.control}
      name={field.key}
      render={({ field: input }) => (
        <FormItem className="flex flex-row flex-wrap gap-2.5 lg:flex-nowrap">
          <FormLabel
            className="flex w-full max-w-56 items-center gap-1 lg:h-8.5"
            htmlFor={id}
          >
            {field.label}
            {field.optional ? (
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            ) : null}
          </FormLabel>
          <div className="w-full min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  id={id}
                  type={
                    secret && !visible
                      ? 'password'
                      : field.type === 'number'
                        ? 'number'
                        : 'text'
                  }
                  min={field.min}
                  max={field.max}
                  placeholder={
                    secret && field.source !== 'none'
                      ? `•••••••••••• ${field.hint || ''}`.trim()
                      : field.placeholder || '**********'
                  }
                  // The browser must not fill a saved login password into a
                  // box that is for an API key.
                  autoComplete={secret ? 'new-password' : 'off'}
                  data-1p-ignore
                  data-lpignore="true"
                  spellCheck={false}
                  {...input}
                  disabled={disabled}
                  className={cn(
                    secret && 'font-mono',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                />
              </FormControl>
              {secret && !disabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={visible ? 'Hide what I typed' : 'Show what I typed'}
                  onClick={() => setVisible((shown) => !shown)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
              ) : null}
            </div>
            <p className={cn('text-xs', status.tone)}>{status.text}</p>
          </div>
        </FormItem>
      )}
    />
  );
};

/**
 * One service: what it is for, how to get its keys, and the keys themselves.
 *
 * Laid out like the rest of General Settings — a numbered heading with a
 * switch that unlocks the fields. Locked, it shows what is in use. Unlocked,
 * it walks through getting the keys, step by step, and the last step is the
 * boxes they are pasted into.
 */
export default function IntegrationSection({
  integration,
  number,
  canSaveSecrets,
}) {
  const [unlocked, setUnlocked] = useState(false);
  // 'save' or 'reset' while the password is being asked for.
  const [confirming, setConfirming] = useState(null);
  const [passwordError, setPasswordError] = useState('');
  const [problem, setProblem] = useState('');
  const [checked, setChecked] = useState(null);

  const [testIntegration, { isLoading: isTesting }] =
    useTestIntegrationMutation();
  const [updateIntegration, { isLoading: isSaving }] =
    useUpdateIntegrationMutation();
  const [resetIntegration, { isLoading: isResetting }] =
    useResetIntegrationMutation();

  const defaults = useMemo(() => startingValues(integration), [integration]);
  const form = useForm({ defaultValues: defaults });
  const values = form.watch();
  const changes = changedValues(integration, values);
  const hasChanges = Object.keys(changes).length > 0;
  const busy = isTesting || isSaving || isResetting;

  // What is saved changed (a save, a reset): start again from it.
  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const lock = () => {
    setUnlocked(false);
    setChecked(null);
    setProblem('');
    form.reset(defaults);
  };

  const wantsSecret = integration.fields.some(
    (field) => field.type === 'secret' && changes[field.key],
  );
  const blockedByServer = wantsSecret && !canSaveSecrets;

  const handleTest = async () => {
    setProblem('');
    setChecked(null);
    try {
      setChecked(await testIntegration({ key: integration.key, values: changes }).unwrap());
    } catch (error) {
      setProblem(errorMessage(error, 'The keys could not be checked.'));
    }
  };

  const handleConfirm = async (password) => {
    setPasswordError('');
    try {
      if (confirming === 'reset') {
        await resetIntegration({ key: integration.key, password }).unwrap();
        toast.success(
          `${integration.name} is back on the values the server was set up with`,
        );
      } else {
        const saved = await updateIntegration({
          key: integration.key,
          values: changes,
          password,
        }).unwrap();
        toast.success(
          `${integration.name} saved. ${saved.test?.message || ''}`.trim(),
          saved.test?.note
            ? { description: saved.test.note, duration: 10000 }
            : undefined,
        );
      }
      setConfirming(null);
      lock();
    } catch (error) {
      const message = errorMessage(error, 'Nothing was changed.');
      if (error?.data?.code === 'WRONG_PASSWORD' || error?.status === 429) {
        // Stays in the dialog, where the password can be typed again.
        setPasswordError(message);
        return;
      }
      // Everything else is about the keys, so it is shown next to them.
      setConfirming(null);
      setChecked(null);
      setProblem(message);
    }
  };

  const steps = integration.steps;
  const lastStep = steps[steps.length - 1];

  const fields = (
    <div className="grid gap-5">
      {integration.fields.map((field) => (
        <FieldRow
          key={field.key}
          form={form}
          field={field}
          integrationKey={integration.key}
          disabled={!unlocked || busy}
        />
      ))}
    </div>
  );

  return (
    <Form {...form}>
      <form
        className="grid gap-5"
        onSubmit={form.handleSubmit(() => {
          setPasswordError('');
          setConfirming('save');
        })}
      >
        <ConfirmPasswordDialog
          open={Boolean(confirming)}
          title={
            confirming === 'reset'
              ? `Reset ${integration.name}?`
              : `Save ${integration.name}?`
          }
          description={
            confirming === 'reset'
              ? `What was saved in this panel for ${integration.name} is removed, and the app goes back to the values the server was set up with. This takes effect straight away.`
              : `The new values are checked with ${integration.name} first and saved only if it accepts them. The app starts using them straight away.`
          }
          confirmLabel={confirming === 'reset' ? 'Reset' : 'Check and save'}
          destructive={confirming === 'reset'}
          isWorking={isSaving || isResetting}
          error={passwordError}
          onConfirm={handleConfirm}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <CardTitle>
                {number}. {integration.name}
              </CardTitle>
              <StatusBadge integration={integration} />
            </div>
            <CardDescription>{integration.purpose}</CardDescription>
          </div>
          <div className="flex flex-row items-center gap-2.5">
            <CardDescription>Allow for changes in fields</CardDescription>
            <Switch
              className="data-[state=checked]:bg-blue-500"
              checked={unlocked}
              disabled={busy}
              aria-label={`Allow changes to ${integration.name}`}
              onCheckedChange={(next) => (next ? setUnlocked(true) : lock())}
            />
          </div>
        </div>

        {integration.needsAttention ? (
          <Alert variant="warning" appearance="light" size="md">
            <AlertIcon>
              <TriangleAlert />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>
                What was saved here for {integration.name} is not being used
              </AlertTitle>
              <AlertDescription>
                A key saved here can no longer be read, which happens when the
                server’s encryption key is changed. Nothing is broken:{' '}
                {integration.name} is running on the values the server was set
                up with. To use your own again, switch on “Allow for changes
                in fields” and enter the key again, or reset to the server
                values.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {!unlocked ? (
          fields
        ) : (
          <>
            {integration.warning ? (
              <Alert variant="warning" appearance="light" size="md">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Before you change this</AlertTitle>
                  <AlertDescription>{integration.warning}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            <ol className="grid gap-5">
              {steps.map((step, index) => {
                const isLast = step === lastStep;
                return (
                  <li key={step.title} className="flex gap-3.5">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isLast
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                      )}
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 grow space-y-2 pt-0.5">
                      <div className="text-sm font-semibold text-mono">
                        <span className="sr-only">Step {index + 1}: </span>
                        {step.title}
                      </div>
                      <p className="text-sm text-secondary-foreground">
                        {step.body}
                      </p>
                      {step.link ? (
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={step.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {step.link.label}
                            <ExternalLink />
                          </a>
                        </Button>
                      ) : null}
                      {isLast ? <div className="pt-2.5">{fields}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ol>

            {blockedByServer ? (
              <Alert variant="warning" appearance="light" size="md">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Keys cannot be saved yet</AlertTitle>
                  <AlertDescription>
                    The server has not been given its encryption key
                    (SETTINGS_ENCRYPTION_KEY), so it has no safe way to store
                    this. It is a one-time step for your developer. You can
                    still test the key.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {problem ? (
              <Alert
                variant="destructive"
                appearance="light"
                size="md"
                close
                onClose={() => setProblem('')}
              >
                <AlertIcon>
                  <AlertCircle />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Nothing was changed</AlertTitle>
                  <AlertDescription>{problem}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {checked ? (
              <Alert
                variant={checked.ok ? 'success' : 'destructive'}
                appearance="light"
                size="md"
                close
                onClose={() => setChecked(null)}
              >
                <AlertIcon>
                  {checked.ok ? <CircleCheck /> : <AlertCircle />}
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>{checked.message}</AlertTitle>
                  {checked.note ? (
                    <AlertDescription>{checked.note}</AlertDescription>
                  ) : null}
                </AlertContent>
              </Alert>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2.5">
              {integration.isCustomized ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setPasswordError('');
                    setConfirming('reset');
                  }}
                >
                  <RotateCcw />
                  Reset to server values
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handleTest}
              >
                <PlugZap />
                {isTesting ? 'Checking…' : 'Test connection'}
              </Button>
              <Button
                type="submit"
                disabled={!hasChanges || busy || blockedByServer}
              >
                <Save />
                Save changes
              </Button>
            </div>
          </>
        )}
      </form>
    </Form>
  );
}
