import { Navigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { useGetCurrentUserQuery } from '@/features/auth/authApi';
import { ScreenLoader } from '@/components/screen-loader.jsx';

// Keeps a signed-in admin off the sign-in page.
//
// It waits for the session check rather than reading Redux alone: on a hard
// refresh the store starts empty, so the previous version flashed the sign-in
// form to someone who was already signed in, then redirected out from under
// them mid-keystroke.
const PublicRoute = ({ children }) => {
  const currentUser = useAppSelector(selectCurrentUser);
  const { data, isLoading } = useGetCurrentUserQuery();
  const user = currentUser || data?.user;

  if (isLoading) return <ScreenLoader />;
  if (user) return <Navigate to="/" replace />;

  return children;
};

export default PublicRoute;
