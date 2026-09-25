import React from 'react';
import { useGetCoAdminsQuery } from '@/features/co-admins/coAdminsApi';
import {
  selectAdminPagination,
  selectAdminSearchTerm,
  selectActivePermission,
} from '@/features/co-admins/coAdminsSelectors';
import { closeAdminDialog } from '@/features/co-admins/coAdminsSlice';
import { Helmet } from 'react-helmet-async';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Card, CardContent } from '@/components/ui/card';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import CoAdminTable from './co-admin-table';
import CoAdminsPermissionsTable from './co-admin-permissions-table';
import PermissionDialog from './permission-dialog';

const CoAdminPage = () => {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectAdminSearchTerm);
  const pagination = useAppSelector(selectAdminPagination);
  const selectedPermission = useAppSelector(selectActivePermission);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const activeSearchTerm = searchTerm ? debouncedSearchTerm : '';
  const { data, isFetching } = useGetCoAdminsQuery({
    search: activeSearchTerm,
    page: pagination.currentPage,
    limit: pagination.pageSize,
  });

  return (
    <>
      <Helmet>
        <title>Co-Admin Management - Metronic</title>
      </Helmet>

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>
              {selectedPermission ? `${selectedPermission.name} Permissions` : 'Co-Admin Management'}
            </ToolbarPageTitle>
            <ToolbarDescription>
              {selectedPermission
                ? `Manage permissions for ${selectedPermission.name}`
                : 'Manage co-admins, view their information, and control access'}
            </ToolbarDescription>
          </ToolbarHeading>
        </Toolbar>

        {/* Breadcrumb Navigation */}
          <Breadcrumb className="px-1 py-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink 
                  onClick={() => dispatch(closeAdminDialog())}
                  className="cursor-pointer hover:text-primary"
                >
                  Co-Admins
                </BreadcrumbLink>
              </BreadcrumbItem>
              {
                selectedPermission && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <span>{selectedPermission.name}</span>
                    </BreadcrumbItem>
                  </>
                )
              }
            </BreadcrumbList>
          </Breadcrumb>

        <Card>
          <CardContent className="p-0">
            {selectedPermission ? (
              <CoAdminsPermissionsTable admin={selectedPermission} />
            ) : (
              <CoAdminTable
                admins={data?.admins || []}
                loading={isFetching}
                totalItems={data?.total || 0}
              />
            )}
          </CardContent>
        </Card>
        <PermissionDialog/>
      </div>
    </>
  );
};

export default CoAdminPage;
