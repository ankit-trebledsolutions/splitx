import { Linking, Platform, Share } from 'react-native';

const encode = encodeURIComponent;

/**
 * Opens WhatsApp with the message already typed. With `number` (international
 * digits, no +) it lands in that person's chat; without it WhatsApp asks who
 * to send to. The person still has to press send themselves.
 *
 * Falls back to the wa.me web link when the app isn't installed.
 */
export const inviteViaWhatsApp = async (message, number) => {
  const query = `${number ? `phone=${number}&` : ''}text=${encode(message)}`;
  try {
    await Linking.openURL(`whatsapp://send?${query}`);
  } catch {
    await Linking.openURL(`https://wa.me/${number ?? ''}?text=${encode(message)}`);
  }
};

// iOS separates the body with & and Android with ?, a long-standing quirk of the sms: scheme.
export const inviteViaSms = (message, number = '') =>
  Linking.openURL(`sms:${number}${Platform.OS === 'ios' ? '&' : '?'}body=${encode(message)}`);

// `to` is optional: without it the mail app opens with the recipient left blank.
export const inviteViaEmail = (subject, message, to = '') =>
  // The address goes in as-is: mail apps don't all decode an escaped "@".
  Linking.openURL(`mailto:${to.trim()}?subject=${encode(subject)}&body=${encode(message)}`);

// Opens the Twitter/X app if installed, the website otherwise.
export const inviteViaTwitter = (tweet) =>
  Linking.openURL(`https://twitter.com/intent/tweet?text=${encode(tweet)}`);

// The system share sheet: any other app the person wants to use.
export const inviteViaShareSheet = (message) => Share.share({ message });
