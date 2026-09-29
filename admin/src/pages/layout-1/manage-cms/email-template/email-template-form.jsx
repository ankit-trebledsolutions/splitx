import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Save,
  Send,
  TriangleAlert,
  WandSparkles,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
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
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Toolbar,
  ToolbarActions,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';
import {
  pickContent,
  useGetEmailTemplateQuery,
  usePreviewEmailTemplateDraftMutation,
  useResetEmailTemplateMutation,
  useSendTestEmailMutation,
  useUpdateEmailTemplateMutation,
} from '@/features/email-template/emailTemplateApi';
import EmailEditor from './editor';
import EmailPreview from './email-preview';
import { htmlToText } from './html-to-text';
import ResetTemplateDialog from './reset-template-dialog';

const BASE = '/manage-cms/email-templates';

const EMPTY = { subject: '', preheader: '', body: '', text: '', reason: '' };
const FIELDS = Object.keys(EMPTY);

// The editor and the server can write the same design with different spacing
// around it. That is not an edit.
const sameText = (a, b) => (a ?? '').trim() === (b ?? '').trim();
const sameContent = (a, b) =>
  FIELDS.every((field) => sameText(a[field], b[field]));

// How long typing has to pause before the preview is asked for again.
const PREVIEW_DELAY = 700;

const EmailTemplateForm = () => {
  const { key } = useParams();
  const navigate = useNavigate();
  const {
    data: template,
    isLoading,
    isFetching,
    isError,
  } = useGetEmailTemplateQuery(key, {
    // Somebody else may have edited it since it was last looked at here.
    refetchOnMountOrArgChange: true,
  });
  const [updateTemplate, { isLoading: isSaving }] =
    useUpdateEmailTemplateMutation();
  const [resetTemplate, { isLoading: isResetting }] =
    useResetEmailTemplateMutation();
  const [sendTestEmail, { isLoading: isSending }] = useSendTestEmailMutation();
  const [previewDraft] = usePreviewEmailTemplateDraftMutation();

  const form = useForm({ defaultValues: EMPTY });
  const values = form.watch();

  // What is stored on the server, as far as this page knows. Null until the
  // template has been loaded into the form.
  const [saved, setSaved] = useState(null);
  const [isCustomized, setIsCustomized] = useState(false);
  // The editor keeps its own copy of the design, so loading a different one
  // (first load, reset) means creating the editor again.
  const [editorSeed, setEditorSeed] = useState({ version: 0, body: '' });
  const [activeField, setActiveField] = useState('body');
  const [preview, setPreview] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const editorRef = useRef(null);
  const inputRefs = useRef({});
  const loadedKey = useRef(null);
  const previewRequest = useRef(0);

  const load = useCallback(
    (source) => {
      const content = pickContent(source);
      form.reset(content);
      setSaved(content);
      setIsCustomized(Boolean(source.isCustomized));
      setEditorSeed((seed) => ({
        version: seed.version + 1,
        body: content.body,
      }));
      setServerError('');
    },
    [form],
  );

  // Loaded once per template. Saving refetches it, and letting that refetch
  // write into the form would overwrite whatever was typed in the meantime.
  useEffect(() => {
    if (template && !isFetching && loadedKey.current !== key) {
      loadedKey.current = key;
      load(template);
    }
  }, [template, isFetching, key, load]);

  const dirty = saved ? !sameContent(values, saved) : false;
  const problems = preview?.problems ?? [];
  const busy = isSaving || isResetting || isSending;

  // The preview follows the form, a moment after the typing stops. Answers can
  // arrive out of order, so only the latest request is allowed to be shown.
  const { subject, preheader, body, text, reason } = values;
  useEffect(() => {
    if (!saved) return undefined;
    const request = ++previewRequest.current;
    const timer = setTimeout(
      async () => {
        setIsPreviewing(true);
        try {
          const result = await previewDraft({
            key,
            draft: { subject, preheader, body, text, reason },
          }).unwrap();
          if (request === previewRequest.current) setPreview(result);
        } catch (error) {
          // The last good preview stays up; what went wrong is listed above it.
          if (request === previewRequest.current && error?.status === 400) {
            setPreview((current) => ({
              ...(current || { subject: '', html: '', text: '' }),
              problems: [errorMessage(error)],
            }));
          }
        } finally {
          if (request === previewRequest.current) setIsPreviewing(false);
        }
      },
      request === 1 ? 0 : PREVIEW_DELAY,
    );
    return () => clearTimeout(timer);
    // `saved` is only needed for "has the template loaded yet".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, preheader, body, text, reason, key, saved === null]);

  // Closing the tab or reloading would lose the edit without a word.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleEditorInit = (editor) => {
    editorRef.current = editor;
    // The editor rewrites the design in its own spacing as it loads. That
    // version is what edits are measured against, or the page would claim
    // unsaved changes before anything had been typed.
    const loaded = editor.getContent();
    form.setValue('body', loaded);
    setSaved((current) => (current ? { ...current, body: loaded } : current));
  };

  // Puts a placeholder where the cursor last was, in whichever field that is.
  const insertVariable = (variable) => {
    const token = `{{${variable.key}}}`;

    if (activeField === 'body') {
      editorRef.current?.insertContent(token);
      editorRef.current?.focus();
      return;
    }

    const element = inputRefs.current[activeField];
    const current = form.getValues(activeField) ?? '';
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    form.setValue(
      activeField,
      current.slice(0, start) + token + current.slice(end),
    );
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Registers a field with the form and remembers its element, so a variable
  // can be inserted at its cursor.
  const bind = (field, name) => ({
    ...field,
    ref: (element) => {
      field.ref(element);
      inputRefs.current[name] = element;
    },
    onFocus: () => setActiveField(name),
  });

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const content = pickContent(data);
      await updateTemplate({ key, content }).unwrap();
      setSaved(content);
      setIsCustomized(true);
      toast.success(
        `“${template.name}” saved. The next email is sent in this version.`,
      );
    } catch (error) {
      const message = errorMessage(error, 'Failed to save the template');
      setServerError(message);
      toast.error(message);
    }
  };

  const confirmReset = async () => {
    try {
      const original = await resetTemplate({ key }).unwrap();
      load(original);
      setConfirmingReset(false);
      toast.success(`“${template.name}” is back to its original design`);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to reset the template'));
    }
  };

  const handleSendTest = async () => {
    try {
      const result = await sendTestEmail({
        key,
        draft: form.getValues(),
      }).unwrap();
      if (result.delivered) {
        toast.success(`Test email sent to ${result.to}`);
      } else {
        toast.info(
          `Email sending is not set up on this server, so nothing reached ${result.to}. The test was written to the server log instead.`,
          { duration: 9000 },
        );
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to send the test email'));
    }
  };

  const handleBack = () => {
    if (
      dirty &&
      !window.confirm('You have unsaved changes. Leave without saving them?')
    ) {
      return;
    }
    navigate(BASE);
  };

  if (isLoading || (template && !saved)) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (isError || !template) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">Template not found</h1>
        <Button variant="outline" onClick={() => navigate(BASE)}>
          <ArrowLeft />
          Back to email templates
        </Button>
      </div>
    );
  }

  const designChangedButTextDidNot =
    !sameText(values.body, saved.body) && sameText(values.text, saved.text);

  return (
    <>
      <Helmet>
        <title>{`Edit ${template.name} - Splix Admin`}</title>
      </Helmet>

      <ResetTemplateDialog
        template={template}
        open={confirmingReset}
        onOpenChange={(next) => {
          if (!next && !isResetting) setConfirmingReset(false);
        }}
        onConfirm={confirmReset}
        isResetting={isResetting}
      />

      <div className="container">
        <Toolbar>
          <ToolbarHeading>
            <ToolbarPageTitle>Edit “{template.name}”</ToolbarPageTitle>
            <ToolbarDescription>{template.description}</ToolbarDescription>
          </ToolbarHeading>
          <ToolbarActions>
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft />
              Back
            </Button>
            <Button
              variant="outline"
              disabled={!isCustomized || busy}
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw />
              Reset to default
            </Button>
            <Button
              variant="outline"
              disabled={busy || problems.length > 0}
              onClick={handleSendTest}
            >
              <Send />
              {isSending ? 'Sending…' : 'Send test to me'}
            </Button>
            <Button
              disabled={!dirty || busy || problems.length > 0}
              onClick={form.handleSubmit(onSubmit)}
            >
              <Save />
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </ToolbarActions>
        </Toolbar>

        {serverError ? (
          <Alert
            variant="destructive"
            appearance="light"
            size="md"
            close
            onClose={() => setServerError('')}
            className="mb-5"
          >
            <AlertIcon>
              <AlertCircle />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {problems.length > 0 ? (
          <Alert
            variant="warning"
            appearance="light"
            size="md"
            className="mb-5"
          >
            <AlertIcon>
              <TriangleAlert />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>This cannot be saved yet</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 ps-5">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <div className="grid items-start gap-5 2xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Content</CardTitle>
              {dirty ? (
                <span className="text-sm text-muted-foreground">
                  Unsaved changes
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="mb-5 rounded-lg border border-border bg-muted/40 p-4">
                <div className="text-sm font-medium">Variables</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Filled in for each person when the email is sent. Click one
                  to put it where your cursor is.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {template.variables.map((variable) => (
                    <Button
                      key={variable.key}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="font-mono"
                      title={`${variable.label}, for example “${variable.sample}”`}
                      // Keeps the cursor in the field it is about to write to.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertVariable(variable)}
                    >
                      {`{{${variable.key}}}`}
                      {variable.required ? (
                        <span className="font-sans text-destructive">
                          required
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-5"
                >
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter template subject"
                            maxLength={200}
                            {...bind(field, 'subject')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="preheader"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preview line</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="The grey line shown next to the subject in the inbox"
                            maxLength={200}
                            {...bind(field, 'preheader')}
                          />
                        </FormControl>
                        <FormDescription>
                          Shown next to the subject in the inbox, before the
                          email is opened.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="body"
                    render={() => (
                      <FormItem>
                        <FormLabel>Design</FormLabel>
                        <FormControl>
                          <EmailEditor
                            key={editorSeed.version}
                            initialValue={editorSeed.body}
                            onChange={(content) =>
                              form.setValue('body', content)
                            }
                            onInit={handleEditorInit}
                            onFocus={() => setActiveField('body')}
                            variables={template.variables}
                            blocks={template.blocks}
                            canvas={template.canvas}
                          />
                        </FormControl>
                        <FormDescription>
                          This is the inside of the card. The Splix logo above
                          it and the footer below are added to every email.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="text"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-3">
                          <FormLabel>Plain-text version</FormLabel>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              form.setValue(
                                'text',
                                htmlToText(form.getValues('body')),
                              )
                            }
                          >
                            <WandSparkles />
                            Generate from design
                          </Button>
                        </div>
                        <FormControl>
                          <Textarea
                            rows={9}
                            className="font-mono"
                            maxLength={20000}
                            {...bind(field, 'text')}
                          />
                        </FormControl>
                        <FormDescription>
                          {designChangedButTextDidNot ? (
                            <span className="font-medium text-foreground">
                              The design has changed. Check that this still
                              says the same thing, or generate it again.
                            </span>
                          ) : (
                            'Sent alongside the design, for inboxes that show text only. Spam filters read it too.'
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer line</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="You are receiving this because…"
                            maxLength={300}
                            {...bind(field, 'reason')}
                          />
                        </FormControl>
                        <FormDescription>
                          Tells the reader why they received this email.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="min-w-0 2xl:sticky 2xl:top-24">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <span className="text-sm text-muted-foreground">
                {isPreviewing
                  ? 'Updating…'
                  : 'With sample details: Alex Kumar, code 482913'}
              </span>
            </CardHeader>
            <EmailPreview mail={preview} isLoading={isPreviewing} />
          </Card>
        </div>
      </div>
    </>
  );
};

export default EmailTemplateForm;
