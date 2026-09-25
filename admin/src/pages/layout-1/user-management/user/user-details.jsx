import { Calendar, Mail, Phone, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSetUserActiveMutation } from '@/features/users/usersApi';
import {
  selectSelectedUser,
  selectUserDialogType,
} from '@/features/users/usersSelectors';
import { closeUserDialog } from '@/features/users/usersSlice';

const getStatusBadge = (status, isBlocked) => {
  if (isBlocked) return 'destructive';
  switch (status) {
    case 'active':
      return 'default';
    case 'inactive':
      return 'secondary';
    case 'blocked':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getRoleBadge = (role) => {
  switch (role) {
    case 'admin':
      return 'info';
    case 'moderator':
      return 'default';
    default:
      return 'secondary';
  }
};

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const UserDetails = () => {
  const dispatch = useAppDispatch();
  const selectedUser = useAppSelector(selectSelectedUser);
  const dialogType = useAppSelector(selectUserDialogType);
  const [setUserActive] = useSetUserActiveMutation();

  const handleToggleBlock = async () => {
    if (!selectedUser) return;

    try {
      await setUserActive({ id: selectedUser.id, isActive: !selectedUser.isActive }).unwrap();
      toast.success(
        `${selectedUser.name || 'User'} ${
          selectedUser.isActive ? 'suspended' : 'restored'
        } successfully`,
      );
      dispatch(closeUserDialog());
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update user status'));
      console.error('Failed to toggle user block status:', error);
    }
  };

  return (
    <Dialog
      open={dialogType === 'view'}
      onOpenChange={(open) => {
        if (!open) dispatch(closeUserDialog());
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
          <DialogDescription>
            View detailed information about this user
          </DialogDescription>
        </DialogHeader>
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={selectedUser.avatar} alt={selectedUser.name} />
                <AvatarFallback className="text-lg">
                  {selectedUser.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{selectedUser.name}</h3>
                <Badge variant={getRoleBadge(selectedUser.role)}>
                  {selectedUser.role}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{selectedUser.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{selectedUser.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Joined: {selectedUser.joinDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Last Login: {selectedUser.lastLogin}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm font-medium">Account Status</span>
              <Badge
                variant={getStatusBadge(
                  selectedUser.status,
                  !selectedUser.isActive,
                )}
              >
                {!selectedUser.isActive ? 'Blocked' : selectedUser.status}
              </Badge>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant={!selectedUser.isActive ? 'default' : 'destructive'}
                onClick={handleToggleBlock}
                className="flex-1"
              >
                {!selectedUser.isActive ? (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Unblock User
                  </>
                ) : (
                  <>
                    <UserX className="h-4 w-4 mr-2" />
                    Block User
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserDetails;
