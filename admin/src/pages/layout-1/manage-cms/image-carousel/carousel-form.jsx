import { useEffect, useState } from 'react';
import {
  useCreateCarouselMutation,
  useUpdateCarouselMutation,
} from '@/features/image-carousel/imageCarouselApi';
import {
  selectCarouselDialogType,
  selectSelectedCarousel,
} from '@/features/image-carousel/imageCarouselSelectors';
import { closeCarouselDialog } from '@/features/image-carousel/imageCarouselSlice';
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

const CarouselForm = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectCarouselDialogType);
  const carousel = useAppSelector(selectSelectedCarousel);
  const mode = dialogType === 'edit' ? 'edit' : 'create';
  const isOpen = dialogType === 'create' || dialogType === 'edit';
  const [serverError, setServerError] = useState('');
  const [createCarousel, { isLoading: isCreating }] =
    useCreateCarouselMutation();
  const [updateCarousel, { isLoading: isUpdating }] =
    useUpdateCarouselMutation();
  const isSubmitting = isCreating || isUpdating;
  const form = useForm({
    defaultValues: {
      name: '',
      isActive: '',
    },
  });

  const handleClose = () => {
    setServerError('');
    dispatch(closeCarouselDialog());
  };

  const onSubmit = async (data) => {
    setServerError('');

    try {
      const formattedData = {
        name: data.name,
        isActive: data.isActive === 'true' || data.isActive === true,
      };

      if (mode === 'create') {
        await createCarousel(formattedData).unwrap();
        toast.success('Carousel created successfully');
      } else {
        await updateCarousel({
          id: carousel._id,
          imageData: formattedData,
        }).unwrap();
        toast.success('Carousel updated successfully');
      }

      handleClose();
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save carousel');
      setServerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (mode === 'edit' && carousel) {
      form.reset({
        name: carousel.name || '',
        isActive: carousel.isActive ? 'true' : 'false',
      });
    } else {
      form.reset({
        name: '',
        isActive: 'false',
      });
    }
  }, [mode, carousel, form]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="mt-3 text-3xl">
            {mode === 'create' ? 'Create Carousel' : 'Edit Carousel'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Create a new carousel' : 'Update carousel'}
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
              <AlertTitle>Carousel error</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              rules={{
                required: 'Carousel name is required',
                minLength: {
                  value: 2,
                  message: 'Carousel name must be at least 2 characters',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter carousel name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
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
                  ? 'Create Carousel'
                  : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CarouselForm;
