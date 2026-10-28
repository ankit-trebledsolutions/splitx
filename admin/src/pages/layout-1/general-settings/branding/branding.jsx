import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ImageUp, Info, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { toAbsoluteUrl } from '@/lib/helpers';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeading,
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGetBrandingQuery,
  useRemoveLogoMutation,
  useUpdateBrandingMutation,
  useUploadLogoMutation,
} from '@/features/branding/brandingApi';
import { formatWhen } from '@/features/support/supportLabels';
import { DEFAULT_LOGO } from '@/hooks/use-branding';
import WordmarkPreview from './wordmark-preview';

/**
 * The app's name and logo. Both reach every phone the next time the app
 * opens (it reads them on start and keeps a copy for offline starts), and
 * this panel's sidebar and sign-in page at once.
 *
 * The name keeps the wordmark's look: the lettering stays, and every x in it
 * is drawn the way the x in "Splix" is, as the logo's two chevrons. The
 * preview below the field shows exactly what the splash screen will draw.
 */

// The server's rules (brandingSchema in backend/src/routes/admin.routes.js
// and middleware/upload.js); checking them here only saves a trip.
const NAME_MIN = 2;
const NAME_MAX = 20;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const nameRules = {
  validate: (value) => {
    const text = String(value ?? '').trim();
    if (text.length < NAME_MIN) return `The app name needs at least ${NAME_MIN} characters`;
    if (text.length > NAME_MAX) return `The app name can be at most ${NAME_MAX} characters`;
    if (/[\r\n\t]/.test(text)) return 'The app name must be a single line';
    return true;
  },
};

const HowItWorks = () => (
  <Alert variant="info" appearance="light" size="sm">
    <AlertIcon>
      <Info />
    </AlertIcon>
    <AlertContent>
      <AlertTitle>What changes where</AlertTitle>
      <AlertDescription>
        The name and logo appear on the app’s splash and sign-in screens, in
        the invite messages people send, and in this panel’s sidebar and
        sign-in page. Phones pick the change up the next time the app opens.
        The name on the phone’s home screen and the app icon are part of the
        installed build and need a new APK.
      </AlertDescription>
    </AlertContent>
  </Alert>
);

export default function BrandingPage() {
  const { data: settings, isLoading, error } = useGetBrandingQuery();
  const [updateBranding, { isLoading: isSaving }] = useUpdateBrandingMutation();
  const [uploadLogo, { isLoading: isUploading }] = useUploadLogoMutation();
  const [removeLogo, { isLoading: isRemoving }] = useRemoveLogoMutation();

  const form = useForm({ defaultValues: { appName: 'Splix' }, mode: 'onChange' });
  const { isDirty } = form.formState;
  const typedName = form.watch('appName');

  // What is saved changed (first load, a save): start again from it.
  useEffect(() => {
    if (settings) form.reset({ appName: settings.appName });
  }, [settings, form]);

  // The image picked but not yet uploaded, with a preview of it.
  const fileInput = useRef(null);
  const [picked, setPicked] = useState(null); // { file, url }
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => () => picked && URL.revokeObjectURL(picked.url), [picked]);

  const choose = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('The logo must be a PNG, JPEG or WebP image');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('The logo must be 2 MB or smaller');
      return;
    }
    setPicked({ file, url: URL.createObjectURL(file) });
  };

  const saveName = async ({ appName }) => {
    try {
      const next = await updateBranding({ appName: appName.trim() }).unwrap();
      form.reset({ appName: next.appName });
      toast.success('App name saved. Phones see it the next time the app opens.');
    } catch (err) {
      toast.error(errorMessage(err, 'The app name could not be saved'));
    }
  };

  const upload = async () => {
    if (!picked) return;
    try {
      await uploadLogo(picked.file).unwrap();
      setPicked(null);
      toast.success('Logo uploaded. Phones see it the next time the app opens.');
    } catch (err) {
      toast.error(errorMessage(err, 'The logo could not be uploaded'));
    }
  };

  const remove = async () => {
    try {
      await removeLogo().unwrap();
      setConfirmRemove(false);
      toast.success('Back to the Splix logo.');
    } catch (err) {
      toast.error(errorMessage(err, 'The logo could not be removed'));
    }
  };

  const busy = isSaving || isUploading || isRemoving;
  const currentLogo = settings?.logoUrl || toAbsoluteUrl(DEFAULT_LOGO);
  const shownLogo = picked?.url ?? currentLogo;

  return (
    <>
      <Helmet>
        <title>Branding - {settings?.appName ?? 'Splix'} Admin</title>
      </Helmet>

      <Card>
        <CardHeader className="py-4">
          <CardHeading>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              {settings?.updatedAt
                ? `Last changed ${formatWhen(settings.updatedAt)}.`
                : 'Never changed: the app is Splix with the Splix logo.'}{' '}
              The name and logo the app and this panel show.
            </CardDescription>
          </CardHeading>
        </CardHeader>

        {error ? (
          <CardContent className="p-5 lg:p-7.5">
            <Alert variant="destructive" appearance="light" size="md">
              <AlertIcon>
                <AlertCircle />
              </AlertIcon>
              <AlertContent>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {errorMessage(error, 'The branding settings could not be loaded.')}
                </AlertDescription>
              </AlertContent>
            </Alert>
          </CardContent>
        ) : isLoading ? (
          <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8.5 w-80" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        ) : (
          <>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(saveName)} noValidate>
                <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5">
                  <HowItWorks />

                  <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="appName"
                      rules={nameRules}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>App name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Splix"
                              maxLength={NAME_MAX}
                              autoComplete="off"
                              {...field}
                              disabled={busy}
                            />
                          </FormControl>
                          <FormDescription>
                            {NAME_MIN} to {NAME_MAX} characters. The wordmark keeps its lettering,
                            and every “x” in the name is drawn as the chevron mark, the way the x in
                            Splix is.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-medium">Splash screen</div>
                      <div
                        className="flex items-center justify-center gap-4 rounded-xl px-6 py-6"
                        style={{ background: '#0A0A0A' }}
                      >
                        <img src={shownLogo} className="size-16 object-contain" alt="" />
                        <WordmarkPreview name={typedName} height={40} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        What the app draws while it opens, with the name as typed above and the
                        logo below.
                      </p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="justify-end gap-2.5 px-5 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isDirty || busy}
                    onClick={() => form.reset({ appName: settings.appName })}
                  >
                    <RotateCcw />
                    Undo
                  </Button>
                  <Button type="submit" disabled={!isDirty || busy}>
                    <Save />
                    {isSaving ? 'Saving...' : 'Save name'}
                  </Button>
                </CardFooter>
              </form>
            </Form>

            <Separator />

            <CardContent className="flex flex-col gap-5 p-5 lg:p-7.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-mono text-sm font-semibold">Logo</div>
                {settings.logoUrl ? (
                  <Badge variant="primary" appearance="light" size="sm">
                    Uploaded
                  </Badge>
                ) : (
                  <Badge variant="secondary" appearance="light" size="sm">
                    Built-in Splix logo
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center gap-4">
                  <div
                    className="flex size-28 items-center justify-center rounded-2xl border border-border"
                    style={{ background: '#0A0A0A' }}
                  >
                    <img src={shownLogo} className="size-20 object-contain" alt="" />
                  </div>
                  <div className="flex size-28 items-center justify-center rounded-2xl border border-border bg-background">
                    <img src={shownLogo} className="size-20 object-contain" alt="" />
                  </div>
                </div>

                <div className="flex grow flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    A square PNG with a transparent background looks best: it is drawn on the
                    dark splash screen and on this panel’s light and dark themes alike. At least
                    256 pixels; PNG, JPEG or WebP, up to 2 MB. It is shrunk to 512 pixels when
                    stored.
                  </p>
                  {picked ? (
                    <p className="text-sm">
                      Chosen: <span className="font-medium">{picked.file.name}</span> (
                      {Math.max(1, Math.round(picked.file.size / 1024))} KB). Not uploaded yet.
                    </p>
                  ) : null}
                  <input
                    ref={fileInput}
                    type="file"
                    accept={LOGO_TYPES.join(',')}
                    className="hidden"
                    onChange={choose}
                  />
                  <div className="flex flex-wrap gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      <ImageUp />
                      {picked ? 'Choose another' : 'Choose image'}
                    </Button>
                    {picked ? (
                      <>
                        <Button type="button" disabled={busy} onClick={upload}>
                          <Upload />
                          {isUploading ? 'Uploading...' : 'Upload logo'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setPicked(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    {settings.logoUrl && !picked ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => setConfirmRemove(true)}
                      >
                        <Trash2 />
                        Remove logo
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>

      <AlertDialog open={confirmRemove} onOpenChange={(open) => !isRemoving && setConfirmRemove(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the uploaded logo?</AlertDialogTitle>
            <AlertDialogDescription>
              The app and this panel go back to the built-in Splix logo. The uploaded file is
              deleted; you can upload it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={isRemoving}>
              {isRemoving ? 'Removing...' : 'Remove logo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
