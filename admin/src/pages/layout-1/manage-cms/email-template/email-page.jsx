import { ArrowLeft, Pencil } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { ACCESS_LEVEL, hasPermission, PERMISSIONS } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import {
  useGetEmailTemplatePreviewQuery,
  useGetEmailTemplateQuery,
} from '@/features/email-template/emailTemplateApi';
import EmailPreview from './email-preview';

const BASE = '/manage-cms/email-templates';

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

// One email, exactly as it is sent today: the saved version, in the real Splix
// frame, filled with sample details.
const EmailPage = () => {
  const { key } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const canEdit = hasPermission(
    currentUser,
    PERMISSIONS.EMAIL_TEMPLATE,
    ACCESS_LEVEL.READ_WRITE,
  );
  const { data: template, isLoading, isError } = useGetEmailTemplateQuery(key);
  const { data: mail, isFetching: isRendering } =
    useGetEmailTemplatePreviewQuery(key, { skip: !template });

  if (isLoading) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (isError || !template) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">Template not found</h1>
        <Button variant="outline" onClick={() => navigate(BASE)}>
          <ArrowLeft />
          Back to email templates
        </Button>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${template.name} - Splix Admin`}</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>{template.name}</ToolbarPageTitle>
            <ToolbarDescription>{template.description}</ToolbarDescription>
          </ToolbarHeading>
          <ToolbarActions>
            <Button variant="outline" onClick={() => navigate(BASE)}>
              <ArrowLeft />
              Back
            </Button>
            {canEdit && (
              <Button onClick={() => navigate(`${BASE}/${key}/edit`)}>
                <Pencil />
                Edit
              </Button>
            )}
          </ToolbarActions>
        </Toolbar>

        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {template.isCustomized ? (
            <Badge variant="info" appearance="light">
              Edited
            </Badge>
          ) : (
            <Badge variant="secondary" appearance="light">
              Original design
            </Badge>
          )}
          {template.required ? (
            <Badge variant="success" appearance="light">
              Always sent
            </Badge>
          ) : template.isActive ? (
            <Badge variant="success" appearance="light">
              Being sent
            </Badge>
          ) : (
            <Badge variant="destructive" appearance="light">
              Switched off
            </Badge>
          )}
          {template.updatedAt && (
            <span>
              Last changed {formatDate(template.updatedAt)}
              {template.updatedBy ? ` by ${template.updatedBy}` : ''}
            </span>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <EmailPreview mail={mail} isLoading={isRendering} />
          </CardContent>
        </Card>

        <p className="mt-3 text-sm text-muted-foreground">
          Shown with sample details (Alex Kumar, code 482913). Each person
          receives their own.
        </p>
      </div>
    </>
  );
};

export default EmailPage;
