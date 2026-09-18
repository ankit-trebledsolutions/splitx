import { requireOptionalNativeModule } from 'expo';
import { DEFAULT_COUNTRY_CODE } from '../config/invite';

// Why the contact list could not be shown; the screen picks its wording from this.
export const CONTACTS_STATUS = {
  OK: 'ok',
  NOT_ASKED: 'not-asked', // permission not requested yet
  DENIED: 'denied', // can ask again
  BLOCKED: 'blocked', // only fixable in system settings
  UNAVAILABLE: 'unavailable', // this build has no contacts module
};

/**
 * Digits WhatsApp accepts: full international number, no +, spaces or dashes.
 * Returns null when the number can't be made sense of (short codes etc.).
 */
export const toWhatsAppNumber = (raw = '') => {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    // Already international.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2); // 00 is the international prefix in many countries
  } else {
    digits = digits.replace(/^0+/, ''); // national trunk prefix: 098765... -> 98765...
    if (digits.length <= 10) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

/**
 * Reads the phone's address book. Contacts are only ever held in memory on
 * this device, to show the list — they are never sent to the server.
 *
 * With ask: false the system prompt is never shown: the list loads only if
 * access was granted earlier. The invite screen uses that on open, and asks
 * only when the person taps "Allow".
 *
 * withEmails: also keep people who only have an email address (they are invited
 * by email instead of WhatsApp). Off by default, for screens that only do WhatsApp.
 *
 * Resolves to { status, contacts } where contacts is
 *   [{ id, name, phone, whatsapp, email, photo }]  sorted by name, one row per
 * person. "whatsapp" is null for email-only people; "photo" is their contact
 * picture's local uri, when they have one.
 */
export const loadPhoneContacts = async ({ ask = true, withEmails = false } = {}) => {
  // A phone still on an older build has no native half for this module, and a
  // failing require() would be a fatal red screen rather than a catchable error.
  if (!requireOptionalNativeModule('ExpoContacts')) {
    return { status: CONTACTS_STATUS.UNAVAILABLE, contacts: [] };
  }
  const Contacts = require('expo-contacts');

  let permission = await Contacts.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    if (!ask) return { status: CONTACTS_STATUS.NOT_ASKED, contacts: [] };
    permission = await Contacts.requestPermissionsAsync();
  }
  if (!permission.granted) {
    return {
      status: permission.canAskAgain ? CONTACTS_STATUS.DENIED : CONTACTS_STATUS.BLOCKED,
      contacts: [],
    };
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Image,
      ...(withEmails ? [Contacts.Fields.Emails] : []),
    ],
    sort: Contacts.SortTypes.FirstName,
  });

  const seen = new Set();
  const contacts = [];
  for (const person of data) {
    const name = person.name?.trim();
    if (!name) continue;
    // Prefer the mobile number; landlines can't receive a WhatsApp invite.
    const numbers = person.phoneNumbers ?? [];
    const best = numbers.find((n) => /mobile|cell|iphone/i.test(n.label ?? '')) ?? numbers[0];
    const whatsapp = toWhatsAppNumber(best?.number);
    const email = withEmails ? person.emails?.[0]?.email?.trim().toLowerCase() || null : null;
    // The same person is often stored twice (SIM + Google); show them once.
    const identity = whatsapp ?? email;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    contacts.push({
      id: person.id,
      name,
      phone: whatsapp ? best.number : null,
      whatsapp,
      email,
      photo: person.imageAvailable ? person.image?.uri ?? null : null,
    });
  }

  contacts.sort((a, b) => a.name.localeCompare(b.name));
  return { status: CONTACTS_STATUS.OK, contacts };
};
