import { Platform } from 'react-native';
import Constants from 'expo-constants';
import client from './client';

// What the phone says about itself, sent with every report so a bug can be
// reproduced on the right build. Nothing here needs a native module: the
// version comes from the app config and the rest from React Native itself.
// On Android `Platform.Version` is the API level and the release name is in
// the constants; iOS gives the version directly and names no model.
export const deviceInfo = () => {
  const constants = Platform.constants ?? {};
  const osVersion =
    Platform.OS === 'android'
      ? `${constants.Release ?? Platform.Version} (API ${Platform.Version})`
      : String(Platform.Version ?? '');
  const model = Platform.OS === 'android' ? [constants.Brand, constants.Model].filter(Boolean).join(' ') : '';
  return {
    platform: Platform.OS,
    osVersion,
    model,
    appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '',
    build: Constants.nativeBuildVersion ? String(Constants.nativeBuildVersion) : '',
  };
};

// Contact Us: a general message with no screenshots.
export const sendSupportMessage = async ({ subject, message }) => {
  const { data } = await client.post('/support/contact', { subject, message, ...deviceInfo() });
  return data.data.report;
};

/**
 * Report a Problem. `screenshots` are [{ uri, name, type }] from the picker;
 * with any, the report goes as a multipart form, otherwise as plain JSON.
 */
export const createReport = async ({ category, subject, message, screenshots = [] }) => {
  const fields = { category, subject, message, ...deviceInfo() };

  if (!screenshots.length) {
    const { data } = await client.post('/support/reports', fields);
    return data.data.report;
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value) form.append(key, value);
  }
  for (const file of screenshots) {
    form.append('screenshots', { uri: file.uri, name: file.name, type: file.type });
  }
  const { data } = await client.post('/support/reports', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Three photos over a slow connection take longer than the usual 15s.
    timeout: 90000,
  });
  return data.data.report;
};

export const fetchMyReports = async () => {
  const { data } = await client.get('/support/reports');
  return data.data.reports;
};

export const fetchReport = async (reportId) => {
  const { data } = await client.get(`/support/reports/${reportId}`);
  return data.data.report;
};
