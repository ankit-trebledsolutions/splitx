import { Lock } from 'lucide-react';
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
 * Confirmation for raising the lowest allowed build.
 *
 * It is the one save in the panel that shuts people out of the app at once:
 * every phone on an older build is held behind an update screen from its
 * very next request. So it is said in full first.
 *
 * `changes` is [{ title, minBuild, downloadUrl }], one per platform being raised.
 */
export default function LockOutDialog({
  changes,
  open,
  onOpenChange,
  onConfirm,
  isSaving,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="size-5 text-destructive" />
            Lock out older builds?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {changes.map((change) => (
                <p key={change.title}>
                  Everyone on {change.title} builds below{' '}
                  <span className="font-semibold text-foreground">
                    {change.minBuild}
                  </span>{' '}
                  is locked out of the whole app from their very next tap,
                  until they install the build at{' '}
                  <span className="break-all font-semibold text-foreground">
                    {change.downloadUrl}
                  </span>
                  .
                </p>
              ))}
              <p className="text-sm">
                Make sure that link really is build{' '}
                {changes.map((c) => c.minBuild).join(' / ')} or newer, signed
                with the usual key, before confirming. Lowering the number
                again lets people back in just as quickly.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              // Kept open while the request runs, so a second click cannot
              // fire a second save.
              event.preventDefault();
              onConfirm();
            }}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Lock out older builds'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
