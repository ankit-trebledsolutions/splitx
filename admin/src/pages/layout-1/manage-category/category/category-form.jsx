import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
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
import {
  useCreateCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from '@/features/category/categoryApi';
import {
  selectCategoryBreadcrumbPath,
  selectCategoryDialogType,
  selectCategoryParentId,
  selectCategorySelectedCategory,
} from '@/features/category/categorySelectors';
import { closeDialog } from '@/features/category/categorySlice';

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const CategoryForm = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectCategoryDialogType);
  const parentId = useAppSelector(selectCategoryParentId);
  const breadcrumbPath = useAppSelector(selectCategoryBreadcrumbPath);
  const categoryData = useAppSelector(selectCategorySelectedCategory);
  const mode = dialogType === 'edit' ? 'edit' : 'create';
  const isOpen = dialogType === 'create' || dialogType === 'edit';
  const [serverError, setServerError] = useState('');
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: isUpdating }] = useUpdateCategoryMutation();
  const { data: parentCategoryData } = useGetCategoriesQuery({
    page: 1,
    limit: 100,
  });
  const categories = parentCategoryData?.categories ?? [];
  const currentParent = breadcrumbPath.find((item) => item.id === parentId);
  const parentOptions =
    currentParent && !categories.some((category) => category._id === parentId)
      ? [...categories, { _id: currentParent.id, categoryName: currentParent.name }]
      : categories;
  const isSubmitting = isCreating || isUpdating;
  const form = useForm({
    defaultValues: {
      categoryName: '',
      parentId: '',
      status: '',
    },
  });

  const handleClose = () => {
    setServerError('');
    dispatch(closeDialog());
  };

  const onSubmit = async (data) => {
    setServerError('');

    try {
      const formattedData = {
        ...data,
        status: data.status === 'true' || data.status === true,
      };

      if (mode === 'create') {
        await createCategory(formattedData).unwrap();
        toast.success('Category created successfully');
      } else {
        await updateCategory({
          id: categoryData._id,
          categoryData: formattedData,
        }).unwrap();
        toast.success('Category updated successfully');
      }

      handleClose();
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save category');
      setServerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (mode === 'edit' && categoryData) {
      form.reset({
        categoryName: categoryData.categoryName,
        parentId:
          categoryData.parentId === null ? 'root_category' : categoryData.parentId,
        status: categoryData.status ? 'true' : 'false',
      });
    } else {
      form.reset({
        categoryName: '',
        parentId: parentId || 'root_category',
        status: '',
      });
    }
  }, [mode, categoryData, form, parentId]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="mt-3 text-3xl">
            {mode === 'create' ? 'Create Category' : 'Edit Category'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Create a new category' : 'Update category'}
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
              <AlertTitle>Category error</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="categoryName"
              rules={{
                required: 'Category name is required',
                minLength: {
                  value: 3,
                  message: 'Category name must be at least 3 characters',
                },
                pattern: {
                  value: /^[a-zA-Z0-9\s]+$/,
                  message:
                    'Category name can only contain letters, numbers, and spaces',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter category name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="root_category">Root Category</SelectItem>
                        {parentOptions.map((category) => (
                          <SelectItem key={category._id} value={category._id}>
                            {category.categoryName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
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
                  ? 'Create Category'
                  : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CategoryForm;
