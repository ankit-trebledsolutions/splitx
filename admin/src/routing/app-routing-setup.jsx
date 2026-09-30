import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router';
import { Layout1 } from '@/components/layouts/layout-1';
import { ScreenLoader } from '@/components/screen-loader.jsx';
import { useAppDispatch } from '@/app/hooks';
import { authApi, useGetCurrentUserQuery } from '@/features/auth/authApi';
import { clearCredentials, setCredentials } from '@/features/auth/authSlice';
import { setUnauthorizedHandler } from '@/lib/api';
import { ACCESS_LEVEL, PERMISSIONS, ROLES } from '@/lib/permissions';
import ProtectedRoute from './protectedRoute';
import PublicRoute from './PublicRoute';

import Login from '@/pages/auth/login';
import Dashboard from '@/pages/layout-1/dashboard/dashboard';
import UserManagement from '@/pages/layout-1/user-management/user-managment';
import UserPage from '@/pages/layout-1/user-management/user/user';
import CoAdminPage from '@/pages/layout-1/user-management/co-admin/co-admin';
import CoAdminsPermissionsTable from '@/pages/layout-1/user-management/co-admin/co-admin-permissions-table';
import ManageCms from '@/pages/layout-1/manage-cms/manage-cms';
import EmailTemplate from '@/pages/layout-1/manage-cms/email-template/email-template';
import EmailPage from '@/pages/layout-1/manage-cms/email-template/email-page';
import GeneralSettings from '@/pages/layout-1/general-settings/general-settings';
import ThirdPartyApis from '@/pages/layout-1/general-settings/third-party-apis/third-party-apis';

// The editing screen brings the whole rich-text editor with it, which is
// larger than the rest of the panel put together. Loaded when it is opened, so
// nobody pays for it on the way to the user list.
const EmailTemplateForm = lazy(
  () => import('@/pages/layout-1/manage-cms/email-template/email-template-form'),
);

// Modules whose screens exist but whose API is not ported yet — the rest of
// general settings, categories, carousels. Their page files are still in
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
  //
  // The remembered answer to /auth/me is blanked as well. PublicRoute reads it
  // alongside the store, so left as it was it still says "signed in" and sends
  // the admin from /login straight back to the page that just failed, which
  // asks again and gets 401 again: round and round, and the sign-in form never
  // appears.
  //
  // Blanked in place, and deliberately not authApi.util.resetApiState(). A
  // reset makes the query mounted a few lines up ask /auth/me again; that
  // answers 401 and lands back here, which resets again, without end. A patch
  // asks for nothing. Signing in brings the entry back, because the login
  // mutation invalidates 'Auth'.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      dispatch(clearCredentials());
      dispatch(
        authApi.util.updateQueryData('getCurrentUser', undefined, (draft) => {
          if (draft) draft.user = null;
        }),
      );
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
        <Route index element={<Dashboard />} />

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

        <Route
          path="general-settings"
          element={
            <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
              <GeneralSettings />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="third-party-apis" replace />} />
          <Route path="third-party-apis" element={<ThirdPartyApis />} />
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
