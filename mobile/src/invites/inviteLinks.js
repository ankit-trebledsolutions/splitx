import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Group invite links. A link is https://<api host>/join/<code> (the server
 * owns the format; see backend/src/routes/join.routes.js) and the same path
 * on the app's own scheme, splix://join/<code>, which the web page uses to
 * open the app. Android hands either to the app (app.json: scheme and
 * intentFilters) and InviteLinkProvider turns it into a pending invite that
 * the Join screen opens as soon as someone is signed in.
 */

// The code remembered across a sign-in or sign-up: the person tapped a link
// while signed out, and lands on the Join screen once they are in.
export const PENDING_INVITE_KEY = 'splix.pendingInvite';

// The code out of a link, or null for any other address the app is opened
// with (the dev client's own links, a notification). Codes are letters and
// digits (eight hex characters today); the server compares them uppercase.
export const inviteCodeFromUrl = (url) => {
  if (!url) return null;
  const match = String(url).match(/(?:^|\/)join\/([A-Za-z0-9]{4,16})(?:[/?#]|$)/);
  return match ? match[1].toUpperCase() : null;
};

export const rememberInvite = (code) => AsyncStorage.setItem(PENDING_INVITE_KEY, code).catch(() => {});

export const forgetInvite = () => AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => {});

export const rememberedInvite = async () => {
  try {
    const code = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    return code && /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
  } catch {
    return null;
  }
};
