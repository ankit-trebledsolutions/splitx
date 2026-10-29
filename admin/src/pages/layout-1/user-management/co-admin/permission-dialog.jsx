import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  selectSelectedAdmin,
  selectAdminDialogType
} from '@/features/co-admins/coAdminsSelectors'
import { closePermissionsDialog } from '@/features/co-admins/coAdminsSlice';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PermissionDialog = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectAdminDialogType);
  const selectedAdmin = useAppSelector(selectSelectedAdmin);
  const permissions = selectedAdmin?.permissions;
  if (!permissions) return null;

  const formatPermissionName = (permission) => {
    return permission
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getAccessLevelVariant = (level) => {
    switch (level) {
      case 'read':
        return 'secondary';
      case 'read_write':
        return 'primary';
      default:
        return 'outline';
    }
  };

  const formatAccessLevel = (level) => {
    if (level === 'read_write') return 'Read & Write';
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const activePermissions = Object.entries(permissions)
    .filter(([, value]) => value !== 'none');

  return (
    <Dialog
     open={dialogType === 'viewPermissions'}
     onOpenChange={(open) => {
      if (!open) dispatch(closePermissionsDialog())
     }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissions</DialogTitle>
          <DialogDescription>
            View permissions for {selectedAdmin?.name}
          </DialogDescription>
        </DialogHeader>
        <div className="w-full">
          {activePermissions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No permissions assigned
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Permission</TableHead>
                  <TableHead className="font-semibold">Access Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePermissions.map(([permission, value]) => (
                  <TableRow key={permission}>
                    <TableCell className="font-medium">
                      {formatPermissionName(permission)}
                    </TableCell>
                    <TableCell>
                      <Badge appearance="outline" shape="circle" variant={getAccessLevelVariant(value)}>
                        {formatAccessLevel(value)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PermissionDialog
