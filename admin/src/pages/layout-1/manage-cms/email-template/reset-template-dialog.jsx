import { RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Confirmation for going back to the built-in design.
 *
 * The edited version is not kept anywhere once it is reset, so this asks
 * first. It takes effect on the very next email that is sent.
 */
export default function ResetTemplateDialog({
  template,
  open,
  onOpenChange,
  onConfirm,
  isResetting,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-destructive" />
            Reset “{template?.name || 'this email'}” to default?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                The subject, design and plain-text version go back to the
                original Splix email.{' '}
                <span className="font-semibold text-foreground">
                  Your edited version is discarded and cannot be brought back.
                </span>
              </p>
              <p className="text-sm">
                The next email of this kind is sent in the original design.
                Whether the email is switched on or off does not change.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              // Kept open while the request runs, so a second click cannot
              // fire a second reset.
              event.preventDefault();
              onConfirm();
            }}
            disabled={isResetting}
          >
            {isResetting ? 'Resetting…' : 'Reset to default'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
