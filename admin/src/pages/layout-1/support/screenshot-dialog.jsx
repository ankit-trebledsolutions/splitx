import { fileUrl } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// One screenshot at full size. The thumbnails in the report are small
// squares; this is the picture the person actually sent.
const ScreenshotDialog = ({ attachment, index, count, open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl p-0 overflow-hidden">
      <DialogHeader className="px-5 pt-5 pb-3">
        <DialogTitle>
          Screenshot {index + 1} of {count}
        </DialogTitle>
        <DialogDescription>
          Sent with the report, shown at the size it was uploaded.
        </DialogDescription>
      </DialogHeader>
      {attachment && (
        <img
          src={fileUrl(attachment.url)}
          alt={`Screenshot ${index + 1}`}
          className="max-h-[75vh] w-full bg-black object-contain"
        />
      )}
    </DialogContent>
  </Dialog>
);

export default ScreenshotDialog;
