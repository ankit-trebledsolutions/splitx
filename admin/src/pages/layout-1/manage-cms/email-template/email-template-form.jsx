import { useEffect, useRef, useState } from 'react';
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
  useCreateEmailTemplateMutation,
  useUpdateEmailTemplateMutation,
} from '@/features/email-template/emailTemplateApi';
import {
  selectEmailTemplateDialogType,
  selectSelectedEmailTemplate,
} from '@/features/email-template/emailTemplateSelectors';
import { closeTemplateDialog } from '@/features/email-template/emailTemplateSlice';
import EmailEditor from './editor';

const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;

const EmailTemplateForm = () => {
  const dispatch = useAppDispatch();
  const dialogType = useAppSelector(selectEmailTemplateDialogType);
  const templateData = useAppSelector(selectSelectedEmailTemplate);
  const mode = dialogType === 'edit' ? 'edit' : 'create';
  const isOpen = dialogType === 'create' || dialogType === 'edit';
  const [serverError, setServerError] = useState('');
  const [inEditMode, setInEditMode] = useState(false);
  const [createTemplate, { isLoading: isCreating }] =
    useCreateEmailTemplateMutation();
  const [updateTemplate, { isLoading: isUpdating }] =
    useUpdateEmailTemplateMutation();
  const editorRef = useRef(null);
  const isSubmitting = isCreating || isUpdating;
  const form = useForm({
    defaultValues: {
      name: '',
      subject: '',
      service: '',
      body: '',
    },
  });

  const handleClose = () => {
    setServerError('');
    dispatch(closeTemplateDialog());
  };

  const onSubmit = async (data) => {
    setServerError('');

    try {
      if (mode === 'create') {
        await createTemplate(data).unwrap();
        toast.success('Template created successfully');
      } else {
        await updateTemplate({
          id: templateData._id,
          templateData: data,
        }).unwrap();
        toast.success('Template updated successfully');
      }

      form.reset();
      handleClose();
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save template');
      setServerError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    if (mode === 'edit' && templateData?._id) {
      setInEditMode(true);
      form.reset({
        name: templateData.name,
        subject: templateData.subject,
        service: templateData.service,
        body: templateData.body,
      });
    } else if (mode === 'create') {
      setInEditMode(false);
      form.reset({
        name: '',
        subject: '',
        service: '',
        body: '',
      });
    }
  }, [mode, templateData, form]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle className="mt-3 text-3xl">
            {mode === 'create' ? 'Create Template' : 'Edit Template'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a new email template'
              : 'Update email template'}
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter template name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter template subject" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="service"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter template service" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Body</FormLabel>
                  <FormControl>
                    <EmailEditor
                      value={field.value}
                      onChange={field.onChange}
                      editorRef={editorRef}
                      inEditMode={inEditMode}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? mode === 'create'
                    ? 'Creating...'
                    : 'Saving...'
                  : mode === 'create'
                    ? 'Create Template'
                    : 'Save Template'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EmailTemplateForm;
