import { Navigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { useGetCurrentUserQuery } from '@/features/auth/authApi';
import { ScreenLoader } from '@/components/screen-loader.jsx';
import { canAccess } from '@/lib/permissions';

const ProtectedRoute = ({
  children,
  role,
  roles,
  permission,
  anyPermissions,
  access,
}) => {
  const currentUser = useAppSelector(selectCurrentUser);
  const { data, isLoading, isFetching } = useGetCurrentUserQuery();
  const user = currentUser || data?.user;
  
  if (isLoading || isFetching) return <ScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (
    !canAccess(user, {
      roles: roles || role,
      permission,
      anyPermissions,
      access,
    })
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
