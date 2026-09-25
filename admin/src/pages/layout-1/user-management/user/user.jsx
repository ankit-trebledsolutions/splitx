import { Helmet } from 'react-helmet-async';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import { useAppSelector } from '@/app/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGetUsersQuery } from '@/features/users/usersApi';
import {
  selectUserPagination,
  selectUserSearchTerm,
} from '@/features/users/usersSelectors';
import UserDetails from './user-details';
import UserForm from './user-form';
import UserTable from './user-table';

export default function UserPage() {
  const searchTerm = useAppSelector(selectUserSearchTerm);
  const pagination = useAppSelector(selectUserPagination);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';
  const { data, isFetching } = useGetUsersQuery({
    search: activeSearchTerm,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });

  const users = data?.users ?? [];
  const totalItems = data?.total ?? 0;

  return (
    <>
      <Helmet>
        <title>User Management - Metronic</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>User Management</ToolbarPageTitle>
            <ToolbarDescription>
              Manage users, view their information, and control access
            </ToolbarDescription>
          </ToolbarHeading>
        </Toolbar>

        <Card>
          <CardContent className="p-0">
            <UserTable
              users={users}
              loading={isFetching}
              totalItems={totalItems}
            />
          </CardContent>
        </Card>

        <UserDetails />
        <UserForm />
      </div>
    </>
  );
}
