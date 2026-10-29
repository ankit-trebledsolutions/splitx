import { AlertCircle, Upload } from 'lucide-react';
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
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const BrandCard = ({
  brandingForm,
  onSubmitBranding,
  isSubmitting,
  handleFileUpload,
  uploadBgImage,
  serverError,
  setServerError,
}) => {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>Customize your branding preferences</CardDescription>
      </CardHeader>
      <CardContent>
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
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
        <Form {...brandingForm}>
          <form
            id="brand-form"
            onSubmit={brandingForm.handleSubmit(onSubmitBranding)}
            className="space-y-8"
          >
            <FormField
              control={brandingForm.control}
              name="appLogo"
              render={({ field }) => (
                <FormItem className="flex flex-row w-full justify-between">
                  <div>
                    <FormLabel>Company Logo</FormLabel>
                    <CardDescription>Upload your company logo</CardDescription>
                  </div>
                  <div className="w-64">
                    <div
                      className="relative w-full h-32 rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer hover:border-primary transition-colors"
                      style={{
                        backgroundImage: `url(${uploadBgImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlend: 'overlay',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                      }}
                      onClick={() =>
                        document.getElementById('logo-upload').click()
                      }
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <Upload />
                        <CardDescription>Click to upload logo</CardDescription>
                        <CardDescription>PNG, JPG up to 10MB</CardDescription>
                      </div>
                      {field.value && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <img
                            src={field.value}
                            alt="Logo preview"
                            className="max-h-20 max-w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <input
                      id="logo-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'appLogo')}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={brandingForm.control}
              name="favicon"
              render={({ field }) => (
                <FormItem className="flex flex-row w-full justify-between">
                  <div>
                    <FormLabel>Favicon</FormLabel>
                    <CardDescription>Upload your favicon</CardDescription>
                  </div>
                  <div className="w-64">
                    <div
                      className="relative w-full h-32 rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer hover:border-primary transition-colors"
                      style={{
                        backgroundImage: `url(${uploadBgImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlend: 'overlay',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                      }}
                      onClick={() =>
                        document.getElementById('favicon-upload').click()
                      }
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <Upload />
                        <CardDescription>
                          Click to upload favicon
                        </CardDescription>
                        <CardDescription>ICO, PNG up to 5MB</CardDescription>
                      </div>
                      {field.value && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <img
                            src={field.value}
                            alt="Favicon preview"
                            className="max-h-20 max-w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <input
                      id="favicon-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'favicon')}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={brandingForm.control}
              name="backgroundImage"
              render={({ field }) => (
                <FormItem className="flex flex-row w-full justify-between">
                  <div>
                    <FormLabel>Background Image</FormLabel>
                    <CardDescription>
                      Upload your background image
                    </CardDescription>
                  </div>
                  <div className="w-64">
                    <div
                      className="relative w-full h-32 rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer hover:border-primary transition-colors"
                      style={{
                        backgroundImage: `url(${uploadBgImage})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlend: 'overlay',
                        backgroundColor: 'rgba(0,0,0,0.3)',
                      }}
                      onClick={() =>
                        document.getElementById('bg-upload').click()
                      }
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                        <Upload />
                        <CardDescription>
                          Click to upload background
                        </CardDescription>
                        <CardDescription>PNG, JPG up to 20MB</CardDescription>
                      </div>
                      {field.value && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <img
                            src={field.value}
                            alt="Background preview"
                            className="max-h-20 max-w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <input
                      id="bg-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'backgroundImage')}
                    />
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button type="submit" form="brand-form" disabled={isSubmitting}>
          {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default BrandCard;
