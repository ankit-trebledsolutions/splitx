import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGetEmailTemplatesQuery } from '@/features/email-template/emailTemplateApi';
import {
  selectEmailTemplatePagination,
  selectEmailTemplateSearchTerm,
} from '@/features/email-template/emailTemplateSelectors';
import EmailTemplateForm from './email-template-form';
import EmailTemplateTable from './email-template-table';

const EmailTemplate = () => {
  const searchTerm = useAppSelector(selectEmailTemplateSearchTerm);
  const pagination = useAppSelector(selectEmailTemplatePagination);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';
  const { data, isFetching } = useGetEmailTemplatesQuery({
    search: activeSearchTerm,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });

  const emailTemplates = data?.data ?? [];
  const totalItems = data?.total ?? 0;

  return (
    <div className="container">
      <Toolbar>
        <ToolbarHeading>
          <ToolbarPageTitle>Email Template</ToolbarPageTitle>
          <ToolbarDescription>Manage email templates</ToolbarDescription>
        </ToolbarHeading>
      </Toolbar>

      <Card>
        <CardContent className="p-0">
          <EmailTemplateTable
            emailTemplates={emailTemplates}
            loading={isFetching}
            totalItems={totalItems}
          />
        </CardContent>
      </Card>

      <EmailTemplateForm />
    </div>
  );
};

export default EmailTemplate;
