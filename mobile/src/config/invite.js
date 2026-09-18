// Everything about how people are invited to Splix, in one place.

// TODO(store launch): replace with the real Play Store / App Store link (or a
// single smart link that picks the right store). Used in every invite message.
export const APP_LINK = 'https://splix.app/download';

// Country calling code assumed for contacts saved without one ("98765 43210").
// Numbers saved with a + prefix are always used as they are.
export const DEFAULT_COUNTRY_CODE = '91';

// Shown and copied without "https://" — it still opens when tapped in chat apps.
export const groupInviteLink = (inviteCode) => `splix.app/join/${inviteCode}`;

/**
 * The pre-written text dropped into WhatsApp / SMS / email.
 *   firstName: the person being invited, when known ("Hey Alex!")
 */
export const inviteMessage = ({ group, inviterName, firstName }) =>
  [
    `Hey${firstName ? ` ${firstName}` : ''}! 👋`,
    '',
    `${inviterName ?? 'I'} invited you to join "${group.name}" on Splix — the easiest way to split expenses, plan trips and keep everyone on the same page.`,
    '',
    `1. Get the app: ${APP_LINK}`,
    `2. Join with this link: ${groupInviteLink(group.inviteCode)}`,
    `   or enter the code ${group.inviteCode}`,
    '',
    'See you there!',
  ].join('\n');

// A person's own invite link, from their personal code (Invite Friends screen).
export const personalInviteLink = (code) => `splix.app/invite/${code}`;

/**
 * Inviting someone to Splix itself, not to a particular group.
 *   firstName: the person being invited, when known
 */
export const appInviteMessage = ({ code, firstName }) =>
  [
    `Hey${firstName ? ` ${firstName}` : ''}! 👋`,
    '',
    "I'm using Splix to split trips and expenses with friends. No more spreadsheets or \"who owes what\" chats. Come join me!",
    '',
    `Get the app: ${APP_LINK}`,
    `My invite code: ${code}`,
    personalInviteLink(code),
  ].join('\n');

// Groups aren't all trips (flats, couples, events), so the wording stays general.
export const groupInviteTweet = ({ group }) =>
  `Join "${group.name}" on Splix, where we split expenses the easy way: ${groupInviteLink(group.inviteCode)} (code ${group.inviteCode}). Get the app: ${APP_LINK}`;

// Short enough for a tweet.
export const appInviteTweet = ({ code }) =>
  `Splitting trips and expenses with friends is finally easy on Splix. Join me with my code ${code}: ${APP_LINK}`;
