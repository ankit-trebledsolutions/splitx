import { useEffect, useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Asks for the admin's own password before a service's keys are changed.
 *
 * Being signed in is not enough for this. The keys decide where Splix's emails
 * and photos go, and a panel left open on a desk, or a session somebody got
 * hold of, should not be all it takes to change them.
 *
 * The password is held only while the dialog is open and is sent with the one
 * request it confirms.
 */
export default function ConfirmPasswordDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  isWorking,
  error,
  onConfirm,
  onOpenChange,
}) {
  const [password, setPassword] = useState('');

  // Never left in the box for the next time the dialog opens.
  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Not dismissible mid-request: the answer would arrive with nowhere
        // to be shown.
        if (!next && isWorking) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            // Stops the form of the section underneath being submitted too.
            event.stopPropagation();
            if (password) onConfirm(password);
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2.5">
            <Label htmlFor="confirm-password">Your password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isWorking}
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                The password you sign in to this panel with.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isWorking}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'primary'}
              disabled={!password || isWorking}
            >
              {isWorking ? 'Checking…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
