import { useEffect, useState } from 'react';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
} from '@/features/users/usersApi';
import {
  selectSelectedUser,
  selectUserDialogType,
} from '@/features/users/usersSelectors';
import { closeUserDialog } from '@/features/users/usersSlice';
import { useGetCoAdminsQuery } from '@/features/co-admins/coAdminsApi';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppDispatch, useAppSelector } from '@/app/hooks';

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const UserForm = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectUserDialogType);
  const userData = useAppSelector(selectSelectedUser);
  const mode = dialogType === 'edit' ? 'edit' : 'create';
  const isOpen = dialogType === 'create' || dialogType === 'edit';
  const [serverError, setServerError] = useState('');
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  
  // Refetch co-admins when admin is created
  const { refetch: refetchCoAdmins } = useGetCoAdminsQuery({
    search: '',
    page: 1,
    limit: 5,
  });
  
  const isSubmitting = isCreating || isUpdating;
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: '',
      phone: '',
    },
  });

  const handleClose = () => {
    setServerError('');
    dispatch(closeUserDialog());
  };

  const onSubmit = async (data) => {
    setServerError('');

    try {
      const userDataToSave =
        mode === 'edit' && !data.password
          ? { ...data, password: undefined }
          : data;

      if (mode === 'create') {
        await createUser(userDataToSave).unwrap();
        toast.success('User created successfully');
        
        // Refetch co-admins if admin is created
        if (userDataToSave.role === 'admin') {
          await refetchCoAdmins();
        }
      } else {
        await updateUser({
          id: userData.id,
          userData: userDataToSave,
        }).unwrap();
        toast.success(`${userDataToSave.name || 'User'} updated successfully`);
        
        // Refetch co-admins if user role changed to admin
        if (userDataToSave.role === 'admin') {
          await refetchCoAdmins();
        }
      }

      form.reset();
      handleClose();
    } catch (error) {
      const message = getErrorMessage(
        error,
        'Network error. Please try again.',
      );
      setServerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (mode === 'edit' && userData?.id) {
      form.reset({
        name: userData.name,
        email: userData.email,
        password: '',
        role: userData.role,
        phone: userData.phone,
      });
    } else if (mode === 'create') {
      form.reset({
        name: '',
        email: '',
        password: '',
        role: '',
        phone: '',
      });
    }
  }, [mode, userData, form]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <DialogDescription className="text-sm">
            {mode === 'create' ? 'Create new resource' : 'Edit Resource'}
          </DialogDescription>
          <DialogTitle className="mt-3 text-3xl">
            {mode === 'create' ? 'Create Resource' : 'Edit Resource'}
          </DialogTitle>
          <DialogDescription>
            Use a email to create a new Resource account.
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <Alert
            variant="destructive"
            appearance="light"
            size="md"
            close
            onClose={() => setServerError('')}
            className="mt-6 flex items-center gap-3 justify-between"
          >
            <AlertIcon>
              <AlertCircle className="h-5 w-5" />
            </AlertIcon>
            <AlertContent className="space-y-0 text-left w-full">
              <AlertTitle>
                {mode === 'create' ? 'Creation Error' : 'Edit Error'}
              </AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-8 space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              rules={{
                required: 'Name is required',
                minLength: {
                  value: 3,
                  message: 'Name must be at least 3 characters',
                },
                maxLength: {
                  value: 50,
                  message: 'Name cannot exceed 50 characters',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              rules={{
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              rules={{
                required: mode === 'create' ? 'Password is required' : false,
                minLength:
                  mode === 'create'
                    ? {
                        value: 6,
                        message: 'Password must be at least 6 characters',
                      }
                    : form.watch('password') &&
                        form.watch('password').length > 0
                      ? {
                          value: 6,
                          message: 'Password must be at least 6 characters',
                        }
                      : undefined,
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Password
                    {mode === 'edit' && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (leave blank to keep current)
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={
                        mode === 'create'
                          ? 'Create a password'
                          : 'Leave blank to keep current password'
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              rules={{ required: 'Role is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              rules={{
                required: 'Phone number is required',
                pattern: {
                  value: /^\+?[1-9]\d{1,14}$/,
                  message: 'Please enter a valid phone number',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Saving...'
                : mode === 'create'
                  ? 'Create Resource'
                  : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default UserForm;
