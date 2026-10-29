import { useState } from 'react';
import { FileText, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const VIEWS = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'text', label: 'Plain text', icon: FileText },
];

/**
 * The email as it would arrive: rendered by the server, in the real Splix
 * frame, with sample details in place of the placeholders.
 *
 * It is shown in a sandboxed frame with nothing allowed. The HTML was written
 * by an admin, and an admin's mistake — or a compromised admin account — must
 * not be able to run anything in the panel of whoever opens the preview.
 */
export default function EmailPreview({ mail, isLoading, className }) {
  const [view, setView] = useState('desktop');

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Subject</div>
          {mail ? (
            <div className="truncate text-sm font-medium" title={mail.subject}>
              {mail.subject || '(no subject)'}
            </div>
          ) : (
            <Skeleton className="mt-1 h-4 w-48" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={view === id ? 'primary' : 'outline'}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'flex justify-center bg-muted/50 p-4 transition-opacity',
          isLoading && mail && 'opacity-60',
        )}
      >
        {!mail ? (
          <Skeleton className="h-[640px] w-full rounded-lg" />
        ) : view === 'text' ? (
          <pre className="h-[640px] w-full overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-5 font-mono text-[0.8125rem] leading-6 text-foreground">
            {mail.text}
          </pre>
        ) : (
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={mail.html}
            className="h-[640px] max-w-full rounded-lg border border-border bg-white"
            style={{ width: view === 'mobile' ? 375 : '100%' }}
          />
        )}
      </div>
    </div>
  );
}
