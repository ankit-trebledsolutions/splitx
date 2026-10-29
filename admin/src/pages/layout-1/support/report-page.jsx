import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Mail,
  Smartphone,
  UserRound,
  UserSearch,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage, fileUrl } from '@/lib/api';
import { getInitials, timeAgo } from '@/lib/helpers';
import { ACCESS_LEVEL, hasPermission, PERMISSIONS } from '@/lib/permissions';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import {
  useGetSupportReportQuery,
  useSetSupportReportPriorityMutation,
  useSetSupportReportStatusMutation,
} from '@/features/support/supportApi';
import {
  PRIORITIES,
  STATUSES,
  categoryOf,
  formatWhen,
  priorityOf,
  reporterOf,
  statusOf,
} from '@/features/support/supportLabels';
import { setUserSearchTerm } from '@/features/users/usersSlice';
import ReportTimeline from './report-timeline';
import ScreenshotDialog from './screenshot-dialog';

const BASE = '/support';

// A label and a value, as the side cards list them.
const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 text-end break-words">{children}</span>
  </div>
);

const ReporterCard = ({ report }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const reporter = reporterOf(report);
  // The Users screen is where more about the person is; sending its search
  // their email lands on their row.
  const canFind =
    reporter.known &&
    reporter.email &&
    hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporter</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 lg:p-7.5 lg:pt-5">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            {reporter.avatar && (
              <AvatarImage src={fileUrl(reporter.avatar)} alt={reporter.name} />
            )}
            <AvatarFallback>{getInitials(reporter.name, 2) || '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-semibold">{reporter.name}</div>
            {reporter.username && (
              <div className="truncate text-sm text-muted-foreground">
                @{reporter.username}
              </div>
            )}
          </div>
          {reporter.known &&
            (reporter.isActive ? (
              <Badge variant="success" appearance="light" className="ms-auto">
                Active
              </Badge>
            ) : (
              <Badge variant="destructive" appearance="light" className="ms-auto">
                Suspended
              </Badge>
            ))}
        </div>
        {reporter.email ? (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={`mailto:${reporter.email}`}
              className="truncate hover:text-primary"
            >
              {reporter.email}
            </a>
          </div>
        ) : null}
        {!reporter.known && (
          <p className="text-sm text-muted-foreground">
            Sent through the older Contact Us form; this is what was typed into
            it.
          </p>
        )}
        {canFind && (
          <Button
            variant="outline"
            onClick={() => {
              dispatch(setUserSearchTerm(reporter.email));
              navigate('/users');
            }}
          >
            <UserSearch />
            Find in Users
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const DeviceCard = ({ device = {} }) => {
  const known = Object.values(device).some(Boolean);
  const platform = device.platform
    ? device.platform.charAt(0).toUpperCase() + device.platform.slice(1)
    : '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5 lg:p-7.5 lg:pt-5">
        {known ? (
          <>
            <Row label="Model">{device.model || '—'}</Row>
            <Row label="System">
              {[platform, device.osVersion].filter(Boolean).join(' ') || '—'}
            </Row>
            <Row label="App version">{device.appVersion || '—'}</Row>
            <Row label="Build">{device.build || '—'}</Row>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="size-4 shrink-0" />
            The app did not say which phone this came from.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DetailsCard = ({ report }) => (
  <Card>
    <CardHeader>
      <CardTitle>Details</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-3 p-5 lg:p-7.5 lg:pt-5">
      <Row label="Kind">{categoryOf(report.category).label}</Row>
      <Row label="Status">
        <Badge variant={statusOf(report.status).variant} appearance="light">
          {statusOf(report.status).label}
        </Badge>
      </Row>
      <Row label="Priority">{priorityOf(report.priority).label}</Row>
      <Row label="Sent">{formatWhen(report.createdAt)}</Row>
      <Row label="Last change">{formatWhen(report.updatedAt)}</Row>
      <Row label="Reference">
        <code className="text-xs text-muted-foreground">{report._id}</code>
      </Row>
    </CardContent>
  </Card>
);

const Screenshots = ({ attachments = [] }) => {
  const [openIndex, setOpenIndex] = useState(null);
  if (attachments.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {attachments.map((attachment, index) => (
          <button
            key={attachment.url}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="overflow-hidden rounded-lg border border-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open screenshot ${index + 1}`}
          >
            <img
              src={fileUrl(attachment.thumbUrl || attachment.url)}
              alt={`Screenshot ${index + 1}`}
              className="size-28 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <ScreenshotDialog
        attachment={openIndex === null ? null : attachments[openIndex]}
        index={openIndex ?? 0}
        count={attachments.length}
        open={openIndex !== null}
        onOpenChange={(next) => {
          if (!next) setOpenIndex(null);
        }}
      />
    </>
  );
};

const PageSkeleton = () => (
  <div className="container">
    <Toolbar>
      <ToolbarHeading>
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-4 w-48" />
      </ToolbarHeading>
    </Toolbar>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-7.5">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  </div>
);

/**
 * One report: what the person wrote and sent, who they are and from which
 * phone, everything that has happened to it since, and the controls to move
 * it on or answer it.
 */
const ReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const canEdit = hasPermission(
    currentUser,
    PERMISSIONS.SUPPORT,
    ACCESS_LEVEL.READ_WRITE,
  );
  const { data: report, isLoading, error } = useGetSupportReportQuery(id);
  const [setStatus, { isLoading: isSettingStatus }] =
    useSetSupportReportStatusMutation();
  const [setPriority, { isLoading: isSettingPriority }] =
    useSetSupportReportPriorityMutation();

  if (isLoading) return <PageSkeleton />;

  if (error || !report) {
    const missing = error?.status === 404;
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">
          {missing ? 'Report not found' : 'The report could not be loaded'}
        </h1>
        {!missing && (
          <p className="text-muted-foreground">
            {errorMessage(error, 'Something went wrong.')}
          </p>
        )}
        <Button variant="outline" onClick={() => navigate(BASE)}>
          <ArrowLeft />
          Back to Support
        </Button>
      </div>
    );
  }

  const reporter = reporterOf(report);
  const status = statusOf(report.status);

  const changeStatus = async (next) => {
    if (next === report.status) return;
    try {
      await setStatus({ id, status: next }).unwrap();
      toast.success(
        `Marked as ${statusOf(next).label.toLowerCase()}. ${reporter.name} has been told.`,
      );
    } catch (err) {
      toast.error(errorMessage(err, 'The status could not be changed'));
    }
  };

  const changePriority = async (next) => {
    if (next === report.priority) return;
    try {
      await setPriority({ id, priority: next }).unwrap();
      toast.success(`Priority set to ${priorityOf(next).label.toLowerCase()}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'The priority could not be changed'));
    }
  };

  return (
    <>
      <Helmet>
        <title>{`${report.subject} - Support - Splix Admin`}</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>{report.subject}</ToolbarPageTitle>
            <ToolbarDescription>
              {categoryOf(report.category).label} · from {reporter.name} ·{' '}
              {timeAgo(report.createdAt)}
            </ToolbarDescription>
          </ToolbarHeading>
          <ToolbarActions>
            <Button variant="outline" onClick={() => navigate(BASE)}>
              <ArrowLeft />
              Back
            </Button>
            <Select
              value={report.status}
              onValueChange={changeStatus}
              disabled={!canEdit || isSettingStatus}
            >
              <SelectTrigger className="w-40" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={report.priority}
              onValueChange={changePriority}
              disabled={!canEdit || isSettingPriority}
            >
              <SelectTrigger className="w-36" aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label} priority
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ToolbarActions>
        </Toolbar>

        {!canEdit && (
          <Alert variant="info" appearance="light" size="sm" className="mb-5">
            <AlertIcon>
              <AlertCircle />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>Read only</AlertTitle>
              <AlertDescription>
                You can see this report but not change it or answer it.
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-7.5">
          <div className="flex flex-col gap-5 lg:col-span-2 lg:gap-7.5">
            <Card>
              <CardHeader>
                <CardTitle>What they wrote</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" appearance="light">
                    {categoryOf(report.category).label}
                  </Badge>
                  <Badge variant={status.variant} appearance="light">
                    {status.label}
                  </Badge>
                  {report.priority !== 'normal' && (
                    <Badge
                      variant={priorityOf(report.priority).variant}
                      appearance="light"
                    >
                      {priorityOf(report.priority).label} priority
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5 lg:pt-5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {report.message}
                </p>
                <Screenshots attachments={report.attachments} />
              </CardContent>
            </Card>

            <ReportTimeline report={report} canEdit={canEdit} />
          </div>

          <div className="flex flex-col gap-5 lg:gap-7.5">
            <ReporterCard report={report} />
            <DeviceCard device={report.device} />
            <DetailsCard report={report} />
          </div>
        </div>
      </div>
    </>
  );
};

export default ReportPage;
