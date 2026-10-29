import { AlertTriangle } from 'lucide-react';
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
 * Confirmation for deleting an account.
 *
 * Deletion is permanent and cascades: the server removes the person's groups,
 * expenses, photos, chats and uploaded files, not just the account row. Until
 * now this happened on a single click of a menu item, with nothing between the
 * click and the data being gone.
 *
 * The list below is what the server actually does (see
 * backend/src/services/userDeletion.service.js), so it is worth keeping the two
 * in step if that changes.
 */
const WIPED = [
  'Their account, profile and sign-in',
  'Groups where they were the only member, including every expense and photo in them',
  'Expenses they paid for, and their share of expenses others paid for',
  'Their tasks, reminders, saved places, stays and itinerary days',
  'Their photos and uploaded files',
  'Their private chats and messages',
];

export default function DeleteUserDialog({ user, open, onOpenChange, onConfirm, isDeleting }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Delete {user?.name || 'this account'}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-semibold text-foreground">
                  This permanently erases their data. It cannot be undone.
                </span>{' '}
                The following is wiped from the database:
              </p>
              <ul className="list-disc space-y-1 ps-5 text-sm">
                {WIPED.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-sm">
                Groups shared with other people are kept — the person is simply removed
                from them. If they still owe money, or are owed any, the deletion will be
                refused and you will be told where.
              </p>
              <p className="text-sm">
                To block someone without erasing anything, close this and use{' '}
                <span className="font-medium text-foreground">Block User</span> instead.
                That is reversible.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              // Kept open while the request runs, so the spinner is visible and
              // a second click cannot fire a second delete.
              event.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
