import { Share } from 'react-native';

// expo-clipboard is optional: if it is installed we copy silently, otherwise we
// fall back to the OS share sheet so the invite link is still usable.
let ExpoClipboard = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  ExpoClipboard = require('expo-clipboard');
} catch (err) {
  ExpoClipboard = null;
}

export const copyText = async (text) => {
  if (ExpoClipboard?.setStringAsync) {
    await ExpoClipboard.setStringAsync(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
};
