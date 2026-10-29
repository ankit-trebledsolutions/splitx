import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config/google';

// Thrown for anything user-facing. `cancelled` lets callers stay quiet when
// the person simply closed the account picker.
export class GoogleSignInError extends Error {
  constructor(message, { cancelled = false } = {}) {
    super(message);
    this.name = 'GoogleSignInError';
    this.cancelled = cancelled;
  }
}

let configured = false;
const ensureConfigured = () => {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    offlineAccess: false,
  });
  configured = true;
};

// Opens the native Google account picker and returns the signed ID token that
// the backend exchanges for our own JWT. Every failure becomes a clear message.
export const signInWithGoogle = async () => {
  ensureConfigured();
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new GoogleSignInError('Sign-in cancelled', { cancelled: true });
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new GoogleSignInError(
        'Google did not return a sign-in token. Check that the web client ID is set correctly.'
      );
    }
    return idToken;
  } catch (err) {
    if (err instanceof GoogleSignInError) throw err;
    if (isErrorWithCode(err)) {
      switch (String(err.code)) {
        case statusCodes.SIGN_IN_CANCELLED:
          throw new GoogleSignInError('Sign-in cancelled', { cancelled: true });
        case statusCodes.IN_PROGRESS:
          throw new GoogleSignInError('A Google sign-in is already in progress.');
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new GoogleSignInError(
            'Google Play Services is missing or out of date on this device.'
          );
        case 'DEVELOPER_ERROR':
        case '10':
          // The classic misconfiguration: package name / signing SHA-1 don't
          // match an Android OAuth client in Google Cloud Console.
          throw new GoogleSignInError(
            'Google sign-in is misconfigured (DEVELOPER_ERROR): the app package name or signing SHA-1 does not match an Android client in Google Cloud Console.'
          );
        default:
          break;
      }
    }
    throw new GoogleSignInError(err?.message || 'Google sign-in failed. Please try again.');
  }
};

// Forgets the cached Google session so the account picker shows again next time.
export const signOutOfGoogle = async () => {
  try {
    ensureConfigured();
    await GoogleSignin.signOut();
  } catch {
    /* nothing to sign out of */
  }
};
