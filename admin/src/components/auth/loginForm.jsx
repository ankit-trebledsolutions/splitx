import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Alert,  
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useLoginMutation } from '@/features/auth/authApi';
import { useAppDispatch } from '@/app/hooks';
import { setCredentials } from '@/features/auth/authSlice';

const LoginForm = () => {
  const [login, { error, isLoading }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true
    },
  });
  const isSubmitting = isLoading;

  const onSubmit = async (data) => {
    try {
      const result = await login(data).unwrap(); 
      dispatch(setCredentials(result.user));
      toast.success('Login successful!');
      navigate('/layout-1');
      form.reset();
    } catch (error) {
      console.log('Login error:', error);
      toast.error(error.data?.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-2">
        <CardContent>
        <CardHeader className="text-center flex flex-col items-center gap-2 pb-4">
          <p className="text-sm text-muted-foreground">Login to your account</p>
          <CardTitle className="mt-3 text-3xl">Log In</CardTitle>
          <CardDescription>
            Use your email and password to access your account.
          </CardDescription>
        </CardHeader>

        {error?.data?.message ? (
          <Alert
            variant="destructive"
            appearance="light"
            size="md"
            close
            onClose={() => {}}
            className="mt-6 flex items-center gap-3 justify-between"
          >
            <AlertIcon>
              <AlertCircle className="h-5 w-5" />
            </AlertIcon>
            <AlertContent className="space-y-0 text-left w-full">
              <AlertTitle>Login error</AlertTitle>
              <AlertDescription>{error?.data?.message}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5">
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
                    <Input type="email" placeholder="Enter your email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              rules={{
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Create a password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            {/* remember me */}
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className='flex flex-row items-center gap-2'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="rememberMe"
                    />
                  </FormControl>
                  <FormLabel htmlFor="rememberMe">Remember me</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />


            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in...' : 'Log In'}
            </Button>
            {/* No sign-up link: the panel has no public registration. Staff
                accounts are created by a super admin from User Management, and
                the very first one by scripts/seed-super-admin.js. */}
            <p className="text-sm text-center text-muted-foreground">
              Accounts are created by an administrator.
            </p>
          </form>
        </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginForm;