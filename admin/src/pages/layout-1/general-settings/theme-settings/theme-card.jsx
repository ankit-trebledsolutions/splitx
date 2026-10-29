import { AlertCircle } from 'lucide-react';
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';


const ThemeCard = ({
  form,
  onSubmitTheme,
  themeOptions,
  isSubmitting,
  handleFileUpload,
  serverError,
  setServerError,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Customize your theme preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
        <Form {...form}>
          <form
            id="theme-form"
            onSubmit={form.handleSubmit(onSubmitTheme)}
            className="space-y-8"
          >
            {/* Theme Selection */}
            <FormField
              control={form.control}
              name="mode"
              rules={{ required: 'Theme selection is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Theme Mode</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex flex-wrap justify-evenly"
                    >
                      {themeOptions.map((option) => (
                        <FormItem
                          key={option.value}
                          className="flex flex-col items-center justify-between gap-0 space-y-2"
                        >
                          <FormControl>
                            <RadioGroupItem
                              value={option.value}
                              className="sr-only"
                              id={`theme-${option.value}`}
                            />
                          </FormControl>
                          <FormLabel
                            htmlFor={`theme-${option.value}`}
                            className={`cursor-pointer rounded-lg border-2 transition-all ${
                              field.value === option.value
                                ? 'border-blue-500'
                                : 'border-border'
                            }`}
                          >
                            <div className="flex flex-col items-center space-y-3">
                              <img
                                src={option.image}
                                alt={option.label}
                                className="w-65 h-full object-cover rounded-md"
                              />
                            </div>
                          </FormLabel>
                          <FormLabel
                            htmlFor={`theme-${option.value}`}
                            className="text-left w-full"
                          >
                            {option.label}
                          </FormLabel>
                          <FormMessage />
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Color Settings */}
            <div className="grid place-items-center grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="primaryColor"
                rules={{ required: 'Primary color is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Color</FormLabel>
                    <div className="flex items-center space-x-3">
                      <Input
                        type="color"
                        value={field.value}
                        onChange={field.onChange}
                        className="w-12 h-12 p-0 rounded border-none outline-none cursor-pointer"
                      />
                      <span className="text-sm text-muted-foreground">
                        {field.value.toUpperCase()}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="secondaryColor"
                rules={{ required: 'Secondary color is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secondary Color</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-3">
                        <Input
                          type="color"
                          value={field.value}
                          onChange={field.onChange}
                          className="w-12 h-12 p-0 border-none rounded outline-none cursor-pointer"
                        />
                        <span className="text-sm text-muted-foreground">
                          {field.value.toUpperCase()}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <FormField
          control={form.control}
          name="transparentSidebar"
          render={({ field }) => (
            <div className="flex items-center space-x-2">
              <CardDescription>Transparent sidebar</CardDescription>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                className="data-[state=checked]:bg-blue-500"
                size="sm"
              />
            </div>
          )}
        />
        <Button type="submit" form="theme-form" disabled={isSubmitting}>
          {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ThemeCard;