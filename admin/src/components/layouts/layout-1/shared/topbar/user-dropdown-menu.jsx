import { Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { API_URL } from '@/lib/api';
import { getInitials } from '@/lib/helpers';
import { ROLES } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { authApi, useLogoutMutation } from '@/features/auth/authApi';
import { selectCurrentUser } from '@/features/auth/authSelectors';
import { clearCredentials } from '@/features/auth/authSlice';
import { coAdminsApi } from '@/features/co-admins/coAdminsApi';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { emailTemplateApi } from '@/features/email-template/emailTemplateApi';
import { integrationsApi } from '@/features/integrations/integrationsApi';
import { usersApi } from '@/features/users/usersApi';

const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Owner',
  [ROLES.ADMIN]: 'Co-admin',
};

// A picture uploaded through the app is stored as a path on the API
// ('/uploads/...'); one from Google or file storage is already a full address.
const avatarUrl = (avatar) => {
  if (!avatar) return undefined;
  return /^(https?:|data:)/.test(avatar) ? avatar : `${API_URL}${avatar}`;
};

// The signed-in admin's own picture, or their initials when they have none (or
// it fails to load). The template showed the same stock photo for everybody.
export function UserAvatar({ className }) {
  const user = useAppSelector(selectCurrentUser);

  return (
    <Avatar className={cn('size-9', className)}>
      <AvatarImage src={avatarUrl(user?.avatar)} alt={user?.name || ''} />
      <AvatarFallback className="font-semibold">
        {getInitials(user?.name || user?.email || '?', 2)}
      </AvatarFallback>
    </Avatar>
  );
}

// The template's menu was a page of demo links (Public Profile, Billing, Dev
// Forum, a language picker with no translations behind it), every one pointing
// at '#'. What is left is what works: who is signed in, the theme, signing out.
export function UserDropdownMenu({ trigger }) {
  const { theme, setTheme } = useTheme();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();

  const handleThemeToggle = (checked) => {
    setTheme(checked ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await logout();
    dispatch(clearCredentials());

    // Clearing the Redux user is not enough on its own: RTK Query keeps its own
    // cache, so /auth/me still answers with the signed-in user from memory. The
    // sign-in page asks that same query whether somebody is already signed in,
    // sees the cached answer, and sends them straight back to the dashboard.
    // Resetting the caches also makes sure the next person to sign in on this
    // browser cannot see the previous one's data for a frame. Every slice the
    // store mounts is listed: one left out keeps its cache across the sign-out.
    dispatch(authApi.util.resetApiState());
    dispatch(usersApi.util.resetApiState());
    dispatch(coAdminsApi.util.resetApiState());
    dispatch(emailTemplateApi.util.resetApiState());
    dispatch(integrationsApi.util.resetApiState());
    dispatch(dashboardApi.util.resetApiState());

    toast.success('Logged out successfully');
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" side="bottom" align="end">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar className="shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {user?.name || 'Admin'}
              </span>
              <span
                className="truncate text-xs text-muted-foreground"
                title={user?.email}
              >
                {user?.email}
              </span>
            </div>
          </div>
          {ROLE_LABELS[user?.role] && (
            <Badge
              variant="primary"
              appearance="light"
              size="sm"
              className="shrink-0"
            >
              {ROLE_LABELS[user.role]}
            </Badge>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex items-center gap-2"
          onSelect={(event) => event.preventDefault()}
        >
          <Moon />
          <div className="flex items-center gap-2 justify-between grow">
            Dark Mode
            <Switch
              size="sm"
              checked={theme === 'dark'}
              onCheckedChange={handleThemeToggle}
            />
          </div>
        </DropdownMenuItem>
        <div className="p-2 mt-1">
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Logout
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
