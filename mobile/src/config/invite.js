// Everything about how people are invited to Splix, in one place.
//
// The app's name and where its invite links point come from the server
// (admin panel > General Settings > Branding; see src/branding). Every
// builder here takes them as `branding`, so a screen passes what useBranding()
// gave it; the defaults are only for a caller that has nothing better.
import { DEFAULT_BRANDING } from '../branding/BrandingProvider';

// TODO(store launch): replace with the real Play Store / App Store link (or a
// single smart link that picks the right store). Used in every invite message.
export const APP_LINK = 'https://splix.app/download';

// Country calling code assumed for contacts saved without one ("98765 43210").
// Numbers saved with a + prefix are always used as they are.
export const DEFAULT_COUNTRY_CODE = '91';

/**
 * A group's invite link: https://<api host>/join/<code>. Tapped on a phone
 * with the app, it opens the Join screen for that group; anywhere else it
 * opens a page with the group and a way to get the app. The server owns the
 * format (backend/src/routes/join.routes.js) and tells the app the base.
 */
export const groupInviteLink = (inviteCode, branding = DEFAULT_BRANDING) =>
  `${branding.inviteBaseUrl}/${inviteCode}`;

/**
 * The pre-written text dropped into WhatsApp / SMS / email.
 *   firstName: the person being invited, when known ("Hey Alex!")
 */
export const inviteMessage = ({ group, inviterName, firstName, branding = DEFAULT_BRANDING }) =>
  [
    `Hey${firstName ? ` ${firstName}` : ''}! 👋`,
    '',
    `${inviterName ?? 'I'} invited you to join "${group.name}" on ${branding.appName} — the easiest way to split expenses, plan trips and keep everyone on the same page.`,
    '',
    `Join with this link: ${groupInviteLink(group.inviteCode, branding)}`,
    `(no app yet? the link shows you where to get it)`,
    `or enter the code ${group.inviteCode} in the app`,
    '',
    'See you there!',
  ].join('\n');

// A person's own invite link, from their personal code (Invite Friends screen).
export const personalInviteLink = (code) => `splix.app/invite/${code}`;

/**
 * Inviting someone to Splix itself, not to a particular group.
 *   firstName: the person being invited, when known
 */
export const appInviteMessage = ({ code, firstName, branding = DEFAULT_BRANDING }) =>
  [
    `Hey${firstName ? ` ${firstName}` : ''}! 👋`,
    '',
    `I'm using ${branding.appName} to split trips and expenses with friends. No more spreadsheets or "who owes what" chats. Come join me!`,
    '',
    `Get the app: ${APP_LINK}`,
    `My invite code: ${code}`,
    personalInviteLink(code),
  ].join('\n');

// Groups aren't all trips (flats, couples, events), so the wording stays general.
export const groupInviteTweet = ({ group, branding = DEFAULT_BRANDING }) =>
  `Join "${group.name}" on ${branding.appName}, where we split expenses the easy way: ${groupInviteLink(group.inviteCode, branding)} (code ${group.inviteCode})`;

// Short enough for a tweet.
export const appInviteTweet = ({ code, branding = DEFAULT_BRANDING }) =>
  `Splitting trips and expenses with friends is finally easy on ${branding.appName}. Join me with my code ${code}: ${APP_LINK}`;
