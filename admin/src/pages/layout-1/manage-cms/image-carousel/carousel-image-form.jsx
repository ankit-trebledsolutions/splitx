import { useEffect, useState } from 'react';
import {
  useCreateCarouselImageMutation,
  useUpdateCarouselImageMutation,
} from '@/features/image-carousel/imageCarouselApi';
import {
  selectActiveCarousel,
  selectCarouselDialogType,
  selectSelectedCarouselImage,
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

const CarouselImageForm = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectCarouselDialogType);
  const carousel = useAppSelector(selectActiveCarousel);
  const carouselImage = useAppSelector(selectSelectedCarouselImage);
  const mode = dialogType === 'editImage' ? 'edit' : 'create';
  const isOpen = dialogType === 'createImage' || dialogType === 'editImage';
  const [serverError, setServerError] = useState('');
  const [fileName, setFileName] = useState('');
  const [createCarouselImage, { isLoading: isCreating }] =
    useCreateCarouselImageMutation();
  const [updateCarouselImage, { isLoading: isUpdating }] =
    useUpdateCarouselImageMutation();
  const isSubmitting = isCreating || isUpdating;
  const form = useForm({
    defaultValues: {
      title: '',
      image: null,
      isActive: '',
    },
  });

  const handleClose = () => {
    setServerError('');
    setFileName('');
    dispatch(closeCarouselDialog());
  };

  const onSubmit = async (data) => {
    setServerError('');

    try {
      const imageFile = data.image?.[0];
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('isActive', data.isActive);

      if (mode === 'create') {
        formData.append('carouselId', carousel._id);
        formData.append('image', imageFile);
        await createCarouselImage(formData).unwrap();
        toast.success('Carousel image created successfully');
      } else {
        if (imageFile) {
          formData.append('image', imageFile);
        }
        await updateCarouselImage({
          id: carouselImage._id,
          imageData: formData,
        }).unwrap();
        toast.success('Carousel image updated successfully');
      }

      handleClose();
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save carousel image');
      setServerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (mode === 'edit' && carouselImage) {
      form.reset({
        title: carouselImage.title || '',
        image: null,
        isActive: carouselImage.isActive ? 'true' : 'false',
      });
      setFileName('');
    } else {
      form.reset({
        title: '',
        image: null,
        isActive: 'true',
      });
      setFileName('');
    }
  }, [mode, carouselImage, form]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="mt-3 text-3xl">
            {mode === 'create'
              ? 'Create Carousel Image'
              : 'Edit Carousel Image'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? `Add an image to ${carousel?.name || 'carousel'}`
              : 'Update carousel image'}
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
              <AlertTitle>Carousel image error</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="title"
              rules={{
                required: 'Title is required',
                minLength: {
                  value: 2,
                  message: 'Title must be at least 2 characters',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter image title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="image"
              rules={{
                validate: (value) =>
                  mode === 'edit' || value?.length > 0 || 'Image is required',
              }}
              render={({ field }) => {
                const { onChange, value, ...inputField } = field;
                void value;

                return (
                  <FormItem>
                    <FormLabel>Image</FormLabel>
                    <FormControl>
                      <Input
                        {...inputField}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        onChange={(event) => {
                          onChange(event.target.files);
                          setFileName(event.target.files?.[0]?.name || '');
                        }}
                      />
                    </FormControl>
                    {mode === 'edit' && !fileName ? (
                      <p className="text-xs text-muted-foreground">
                        Leave empty to keep the current image.
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                );
              }}
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
                  ? 'Create Carousel Image'
                  : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CarouselImageForm;
