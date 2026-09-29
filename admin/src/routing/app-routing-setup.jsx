import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router';
import { Layout1 } from '@/components/layouts/layout-1';
import { ScreenLoader } from '@/components/screen-loader.jsx';
import { useAppDispatch } from '@/app/hooks';
import { useGetCurrentUserQuery } from '@/features/auth/authApi';
import { clearCredentials, setCredentials } from '@/features/auth/authSlice';
import { setUnauthorizedHandler } from '@/lib/api';
import { ACCESS_LEVEL, PERMISSIONS } from '@/lib/permissions';
import ProtectedRoute from './protectedRoute';
import PublicRoute from './PublicRoute';

import Login from '@/pages/auth/login';
import { Layout1Page } from '@/pages/layout-1/page';
import UserManagement from '@/pages/layout-1/user-management/user-managment';
import UserPage from '@/pages/layout-1/user-management/user/user';
import CoAdminPage from '@/pages/layout-1/user-management/co-admin/co-admin';
import CoAdminsPermissionsTable from '@/pages/layout-1/user-management/co-admin/co-admin-permissions-table';
import ManageCms from '@/pages/layout-1/manage-cms/manage-cms';
import EmailTemplate from '@/pages/layout-1/manage-cms/email-template/email-template';
import EmailPage from '@/pages/layout-1/manage-cms/email-template/email-page';

// The editing screen brings the whole rich-text editor with it, which is
// larger than the rest of the panel put together. Loaded when it is opened, so
// nobody pays for it on the way to the user list.
const EmailTemplateForm = lazy(
  () => import('@/pages/layout-1/manage-cms/email-template/email-template-form'),
);

// Modules whose screens exist but whose API is not ported yet — general
// settings, categories, carousels. Their page files are still in
// src/pages; they are simply not routed, so nothing links to an endpoint that
// would 404. Re-adding one is a Route element, not a rewrite.

const Unauthorized = () => (
  <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
    <h1 className="text-2xl font-semibold">Unauthorized</h1>
    <p className="text-muted-foreground">
      You do not have permission to access this page.
    </p>
  </div>
);

const NotFound = () => (
  <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
    <h1 className="text-2xl font-semibold">Page not found</h1>
    <p className="text-muted-foreground">That page does not exist.</p>
  </div>
);

export function AppRoutingSetup() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data } = useGetCurrentUserQuery();

  // Restores the session from the httpOnly cookie on load. The panel cannot
  // read that cookie, so asking the server is the only way to know it is signed
  // in — which is why this runs before anything renders behind a guard.
  useEffect(() => {
    if (data?.user) dispatch(setCredentials(data.user));
  }, [data, dispatch]);

  // One place handles an expired session: any request answering 401 clears the
  // user and returns to sign-in, instead of leaving a page of failed panels.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      dispatch(clearCredentials());
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [dispatch, navigate]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout1 />
          </ProtectedRoute>
        }
      >
        <Route index element={<Layout1Page />} />

        <Route
          path="users"
          element={
            <ProtectedRoute permission={PERMISSIONS.USER_MANAGEMENT}>
              <UserManagement />
            </ProtectedRoute>
          }
        >
          <Route index element={<UserPage />} />
          <Route path="co-admins" element={<CoAdminPage />} />
          <Route path="co-admins/permissions" element={<CoAdminsPermissionsTable />} />
        </Route>

        <Route
          path="manage-cms"
          element={
            <ProtectedRoute anyPermissions={[PERMISSIONS.EMAIL_TEMPLATE]}>
              <ManageCms />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="email-templates" replace />} />
          <Route
            path="email-templates"
            element={
              <ProtectedRoute permission={PERMISSIONS.EMAIL_TEMPLATE}>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route index element={<EmailTemplate />} />
            <Route path=":key" element={<EmailPage />} />
            <Route
              path=":key/edit"
              element={
                <ProtectedRoute
                  permission={PERMISSIONS.EMAIL_TEMPLATE}
                  access={ACCESS_LEVEL.READ_WRITE}
                >
                  <Suspense fallback={<ScreenLoader />}>
                    <EmailTemplateForm />
                  </Suspense>
                </ProtectedRoute>
              }
            />
          </Route>
        </Route>

        <Route path="unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Only reached when signed out: the guarded tree above catches the rest,
          so a stray URL no longer throws a signed-in admin back to sign-in. */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
