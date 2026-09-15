// Google Sign-In client IDs — from Google Cloud Console → APIs & Services →
// Credentials. These are public identifiers that ship inside the app (not
// secrets), so it's fine to keep them here. Paste yours below.
//
//   WEB client ID     → required on EVERY platform. The native sign-in library
//                       uses it to mint the ID token, and the backend verifies
//                       tokens against it.
//   iOS client ID     → only needed when you build for iOS.
//   Android client ID → NOT used in code at all. Google recognises the Android
//                       app by package name (com.splity.app) + the SHA-1 of
//                       the keystore that signs it, which you register in the
//                       Cloud Console instead of pasting anywhere.
export const GOOGLE_WEB_CLIENT_ID = '767903745715-rt5tekcspo8sqelt02qhc5ivrrmgjmms.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = '767903745715-drmqg33t25j26vt5prfjtrkjeiqi75k9.apps.googleusercontent.com';
