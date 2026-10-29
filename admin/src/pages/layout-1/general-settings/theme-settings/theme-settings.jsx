import { useEffect, useMemo, useState } from 'react';
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from '@/features/general/generalSettingApi';
import { useForm } from 'react-hook-form';
import darkModeImage from '../../../../../dist/media/images/600x400/28.jpg';
import systemModeImage from '../../../../../dist/media/images/600x400/30.jpg';
import lightModeImage from '../../../../../dist/media/images/600x400/32.jpg';
import uploadBgImage from '../../../../../dist/media/images/2600x1600/bg-2.png';
import BrandCard from './brand-card';
import ThemeCard from './theme-card';

const ThemeSettings = () => {
  const [dismissedError, setDismissedError] = useState(false);
  const {
    data: settings,
    isLoading: isSettingsLoading,
    isFetching,
    error: getSettingsError,
  } = useGetSettingsQuery('theme');
  const [
    updateSettings,
    { isLoading: isUpdating, error: updateSettingsError },
  ] = useUpdateSettingsMutation();

  const serverError = useMemo(() => {
    const error = updateSettingsError || getSettingsError;
    return error?.data?.message || error?.error || null;
  }, [getSettingsError, updateSettingsError]);
  const visibleServerError = dismissedError ? null : serverError;

  const form = useForm({
    defaultValues: {
      mode: 'light',
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      transparentSidebar: false,
    },
  });

  const brandingForm = useForm({
    defaultValues: {
      appLogo: '',
      favicon: '',
      backgroundImage: '',
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings?.theme) {
      form.reset({
        mode: settings.theme.mode || 'dark',
        primaryColor: settings.theme.primaryColor || '#000000',
        secondaryColor: settings.theme.secondaryColor || '#ffffff',
        transparentSidebar: settings.theme.transparentSidebar || false,
      });
      brandingForm.reset({
        appLogo: settings.theme.appLogo || '',
        favicon: settings.theme.favicon || '',
        backgroundImage: settings.theme.backgroundImage || '',
      });
    }
  }, [settings, form, brandingForm]);

  const onSubmitTheme = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'theme', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  const onSubmitBranding = async (data) => {
    try {
      setDismissedError(false);
      await updateSettings({ section: 'theme', data }).unwrap();
    } catch (error) {
      console.error('Settings save error:', error);
    }
  };

  // File upload handler
  const handleFileUpload = (event, fieldName) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        brandingForm.setValue(fieldName, reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const themeOptions = [
    {
      value: 'dark',
      label: 'Dark',
      image: darkModeImage,
    },
    {
      value: 'light',
      label: 'Light',
      image: lightModeImage,
    },
    {
      value: 'system',
      label: 'System',
      image: systemModeImage,
    },
  ];

  return (
    <>
      <ThemeCard
        form={form}
        onSubmitTheme={onSubmitTheme}
        themeOptions={themeOptions}
        isSubmitting={isSettingsLoading || isFetching || isUpdating}
        handleFileUpload={handleFileUpload}
        serverError={visibleServerError}
        setServerError={() => setDismissedError(true)}
      />

      <BrandCard
        brandingForm={brandingForm}
        onSubmitBranding={onSubmitBranding}
        isSubmitting={isSettingsLoading || isFetching || isUpdating}
        handleFileUpload={handleFileUpload}
        uploadBgImage={uploadBgImage}
        serverError={visibleServerError}
        setServerError={() => setDismissedError(true)}
      />
    </>
  );
};

export default ThemeSettings;
