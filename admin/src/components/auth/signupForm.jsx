import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useSignupMutation } from '@/features/auth/authApi';

const SignupForm = () => {
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: ''
    },
    mode: 'onSubmit',
  });

  const navigate = useNavigate();
  const [signup, { error, isLoading }] = useSignupMutation();
  const isSubmitting = isLoading;

  const onSubmit = async (data) => {
    try {
      await signup(data).unwrap();
      toast.success('Account created successfully! Please login.');
      navigate('/login');
      form.reset();
    } catch (error) {
      setServerError(error.message || 'Unable to create account.');
      toast.error(error.message || 'Signup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-2">
        <CardContent>
          <CardHeader className="text-center flex flex-col items-center gap-2 pb-4">
            <p className="text-sm text-muted-foreground">Create your account</p>
            <CardTitle className="mt-3 text-3xl">Sign Up</CardTitle>
            <CardDescription>
              Use your email to create a new admin account.
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
                <AlertTitle>Signup error</AlertTitle>
                <AlertDescription>{error?.data?.message}</AlertDescription>
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
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Create a password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Sign Up'}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-primary hover:text-primary/80"
                >
                  Log in
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignupForm;