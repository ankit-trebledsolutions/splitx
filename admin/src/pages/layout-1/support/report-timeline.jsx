import { useState } from 'react';
import { ArrowRightLeft, Flag, Lock, Send, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAddSupportReplyMutation } from '@/features/support/supportApi';
import {
  formatWhen,
  priorityOf,
  reporterOf,
  statusOf,
} from '@/features/support/supportLabels';

const MAX_REPLY = 2000;

// A change of status or priority: one line, who and when.
const ChangeLine = ({ icon: Icon, children, when }) => (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Icon className="size-3.5 shrink-0" />
    <span className="grow">{children}</span>
    <span className="shrink-0 whitespace-nowrap">{formatWhen(when)}</span>
  </div>
);

// What was written: a reply the reporter sees, or a note only admins see.
const Message = ({ event }) => {
  const internal = event.kind === 'note';
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        internal ? 'border-dashed border-border bg-accent/40' : 'border-border',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{event.byName || 'An admin'}</span>
        {internal ? (
          <Badge variant="warning" appearance="light" size="sm">
            <Lock />
            Internal note
          </Badge>
        ) : (
          <Badge variant="success" appearance="light" size="sm">
            Reply
          </Badge>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {formatWhen(event.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{event.body}</p>
    </div>
  );
};

const Event = ({ event }) => {
  switch (event.kind) {
    case 'reply':
    case 'note':
      return <Message event={event} />;
    case 'status':
      return (
        <ChangeLine icon={ArrowRightLeft} when={event.createdAt}>
          <strong className="font-medium text-foreground">
            {event.byName || 'An admin'}
          </strong>{' '}
          set the status to{' '}
          <strong className="font-medium text-foreground">
            {statusOf(event.status).label}
          </strong>
        </ChangeLine>
      );
    case 'priority':
      return (
        <ChangeLine icon={Flag} when={event.createdAt}>
          <strong className="font-medium text-foreground">
            {event.byName || 'An admin'}
          </strong>{' '}
          set the priority to{' '}
          <strong className="font-medium text-foreground">
            {priorityOf(event.priority).label}
          </strong>
        </ChangeLine>
      );
    default:
      return null;
  }
};

/**
 * Everything that has happened to a report, oldest first, and the box to add
 * to it. A reply reaches the reporter's phone; a note stays between admins.
 * The server moves an open report to In progress when it is first answered.
 */
const ReportTimeline = ({ report, canEdit }) => {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [addReply, { isLoading: isSending }] = useAddSupportReplyMutation();
  const reporter = reporterOf(report);
  const events = report.events ?? [];
  const text = body.trim();

  const send = async () => {
    if (!text || isSending) return;
    try {
      await addReply({ id: report._id, body: text, internal }).unwrap();
      toast.success(
        internal
          ? 'Note added. Only admins can see it.'
          : `Reply sent. ${reporter.name} has been told.`,
      );
      setBody('');
    } catch (error) {
      toast.error(errorMessage(error, 'The reply could not be sent'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            Replies reach {reporter.name}. Notes stay between admins.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-5">
        <ChangeLine icon={Inbox} when={report.createdAt}>
          <strong className="font-medium text-foreground">{reporter.name}</strong>{' '}
          sent this report
        </ChangeLine>

        {events.map((event) => (
          <Event key={event._id ?? `${event.kind}-${event.createdAt}`} event={event} />
        ))}

        {canEdit ? (
          <div className="mt-2 flex flex-col gap-3 border-t border-border pt-5">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, MAX_REPLY))}
              placeholder={
                internal
                  ? 'A note for other admins...'
                  : `Write to ${reporter.name}...`
              }
              rows={4}
              aria-label={internal ? 'Internal note' : 'Reply'}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="support-internal"
                  checked={internal}
                  onCheckedChange={(checked) => setInternal(checked === true)}
                />
                <Label htmlFor="support-internal" className="cursor-pointer">
                  Internal note, admins only
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {text.length}/{MAX_REPLY}
                </span>
                <Button onClick={send} disabled={!text || isSending}>
                  {internal ? <Lock /> : <Send />}
                  {internal ? 'Add note' : 'Send reply'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 border-t border-border pt-4 text-sm text-muted-foreground">
            You can read this report but not answer it. Ask an owner for write
            access to Support.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportTimeline;
