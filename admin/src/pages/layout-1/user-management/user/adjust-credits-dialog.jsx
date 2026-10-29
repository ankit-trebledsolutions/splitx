import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CircleMinus, CirclePlus } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import {
  useAdjustUserWalletMutation,
  useGetWalletSettingsQuery,
} from '@/features/wallet/walletApi';
import {
  formatCredits,
  newRequestId,
  plural,
} from '@/features/wallet/walletLabels';

// The server's own bounds (walletAdjustSchema in admin.routes.js).
const MAX_AMOUNT = 1000000;
const REASON_MIN = 3;
const REASON_MAX = 300;

const EMPTY = { amount: '', reason: '' };

const COPY = {
  grant: {
    title: 'Grant credits',
    verb: 'Grant',
    done: 'Granted',
    busy: 'Granting...',
    preposition: 'to',
    icon: CirclePlus,
    note: 'Granted credits are paid credits: they never expire.',
  },
  deduct: {
    title: 'Deduct credits',
    verb: 'Deduct',
    done: 'Deducted',
    busy: 'Deducting...',
    preposition: 'from',
    icon: CircleMinus,
    note: "Paid credits are taken first, then this month's free ones.",
  },
};

const credits = (count) =>
  `${formatCredits(count)} ${plural(count, 'credit', 'credits')}`;

/**
 * Adds credits to one person's wallet or takes some away, with a reason only
 * admins see. Two steps: what and why, then a plain sentence to confirm.
 *
 * The id that makes the server apply it once is made when the confirm step
 * opens, so every press of that one Confirm (a double click, a retry after a
 * dropped connection) carries the same id and lands once. Going back to change
 * the amount makes a new one.
 */
export default function AdjustCreditsDialog({
  open,
  type,
  user,
  wallet,
  onOpenChange,
  onDone,
}) {
  const copy = COPY[type] ?? COPY.grant;
  const Icon = copy.icon;
  const currentUser = useAppSelector(selectCurrentUser);
  const owner = isSuperAdmin(currentUser);
  const { data: settings } = useGetWalletSettingsQuery(undefined, {
    skip: !open || owner,
  });
  const cap = owner ? null : (settings?.coAdminGrantCap ?? null);
  const balance = wallet?.balance ?? 0;

  const [adjust, { isLoading }] = useAdjustUserWalletMutation();
  const [step, setStep] = useState('form');
  const [requestId, setRequestId] = useState(null);
  const [problem, setProblem] = useState('');
  // Set the moment Confirm is pressed, before React has drawn the button
  // disabled, so a second press in that gap does nothing.
  const sending = useRef(false);

  const form = useForm({ defaultValues: EMPTY, mode: 'onTouched' });
  const reason = form.watch('reason') ?? '';

  // Each opening starts clean.
  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      setStep('form');
      setRequestId(null);
      setProblem('');
    }
  }, [open, type, form]);

  const validateAmount = (raw) => {
    const text = String(raw ?? '').trim();
    if (text === '') return 'Enter how many credits';
    if (!/^\d+$/.test(text)) return 'Enter a whole number, with no decimals';
    const amount = Number(text);
    if (amount < 1) return 'Enter at least 1 credit';
    if (amount > MAX_AMOUNT) {
      return `Enter at most ${formatCredits(MAX_AMOUNT)} credits`;
    }
    if (cap !== null && amount > cap) {
      return `Co-admins can ${type} up to ${credits(cap)} at a time. Ask an owner for more.`;
    }
    if (type === 'deduct' && amount > balance) {
      return `They have ${credits(balance)}, so ${formatCredits(amount)} cannot be deducted.`;
    }
    return true;
  };

  const validateReason = (raw) => {
    const text = String(raw ?? '').trim();
    if (text.length < REASON_MIN) return 'Say why, in a few words';
    if (text.length > REASON_MAX) {
      return `Keep it to ${REASON_MAX} characters`;
    }
    return true;
  };

  const toConfirm = () => {
    setProblem('');
    setRequestId(newRequestId());
    setStep('confirm');
  };

  const back = () => {
    setProblem('');
    setRequestId(null);
    setStep('form');
  };

  const confirm = async () => {
    if (sending.current || !requestId) return;
    sending.current = true;
    setProblem('');
    const values = form.getValues();
    const amount = Number(values.amount);
    try {
      const result = await adjust({
        id: user.id,
        type,
        amount,
        reason: values.reason.trim(),
        requestId,
      }).unwrap();
      toast.success(
        `${copy.done} ${credits(amount)} ${copy.preposition} ${user.name || 'this person'}. Their balance is now ${formatCredits(result?.wallet?.balance)}.`,
      );
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      setProblem(
        errorMessage(
          err,
          `The credits could not be ${copy.done.toLowerCase()}.`,
        ),
      );
    } finally {
      sending.current = false;
    }
  };

  const amount = Number(form.getValues('amount')) || 0;
  const after = type === 'deduct' ? balance - amount : balance + amount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isLoading && onOpenChange(next)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {user.name || 'This person'} has {credits(balance)} (free{' '}
            {formatCredits(wallet?.free)}, paid {formatCredits(wallet?.paid)}).
          </DialogDescription>
        </DialogHeader>

        {step === 'form' ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(toConfirm)}
              className="space-y-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="amount"
                rules={{ validate: validateAmount }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <InputGroup>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={cap ?? MAX_AMOUNT}
                          step={1}
                          placeholder="0"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <InputAddon>credits</InputAddon>
                    </InputGroup>
                    <FormDescription>
                      {copy.note}
                      {cap !== null
                        ? ` As a co-admin you can ${type} up to ${credits(cap)} at a time.`
                        : ''}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                rules={{ validate: validateReason }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        maxLength={REASON_MAX}
                        placeholder={
                          type === 'grant'
                            ? 'For example: refund for a call that dropped'
                            : 'For example: credits granted by mistake'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Only admins see this; it is never shown in the app.{' '}
                      {reason.length}/{REASON_MAX}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Continue</Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold">
                {copy.verb} {credits(amount)} {copy.preposition}{' '}
                {user.name || 'this person'}?
              </p>
              <p className="text-sm text-secondary-foreground">
                Their balance goes from {formatCredits(balance)} to{' '}
                {formatCredits(after)}.
              </p>
              <div className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                <span className="break-words">
                  {form.getValues('reason').trim()}
                </span>
              </div>
            </div>

            {problem ? (
              <Alert variant="destructive" appearance="light" size="sm">
                <AlertIcon>
                  <AlertCircle />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Not done</AlertTitle>
                  <AlertDescription>{problem}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            <DialogFooter className="pt-0">
              <Button
                type="button"
                variant="outline"
                onClick={back}
                disabled={isLoading}
              >
                <ArrowLeft />
                Back
              </Button>
              <Button
                type="button"
                variant={type === 'deduct' ? 'destructive' : 'primary'}
                onClick={confirm}
                disabled={isLoading}
              >
                <Icon />
                {isLoading ? copy.busy : `${copy.verb} ${credits(amount)}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
