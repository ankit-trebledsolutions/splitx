// Best-effort flag for a free-text trip location ("Bali, Indonesia" -> 🇮🇩).
// Keys are lowercase country names and popular destinations; values are ISO codes.
const PLACES = {
  india: 'IN', goa: 'IN', delhi: 'IN', mumbai: 'IN', jaipur: 'IN', kerala: 'IN', manali: 'IN',
  ladakh: 'IN', shimla: 'IN', bangalore: 'IN', bengaluru: 'IN', rishikesh: 'IN', udaipur: 'IN',
  indonesia: 'ID', bali: 'ID', jakarta: 'ID',
  japan: 'JP', tokyo: 'JP', kyoto: 'JP', osaka: 'JP',
  thailand: 'TH', bangkok: 'TH', phuket: 'TH', pattaya: 'TH', krabi: 'TH',
  'united states': 'US', usa: 'US', 'new york': 'US', 'los angeles': 'US', 'las vegas': 'US',
  'san francisco': 'US', miami: 'US', hawaii: 'US', chicago: 'US',
  'united kingdom': 'GB', england: 'GB', scotland: 'GB', london: 'GB', edinburgh: 'GB',
  france: 'FR', paris: 'FR',
  italy: 'IT', rome: 'IT', venice: 'IT', milan: 'IT', florence: 'IT',
  spain: 'ES', barcelona: 'ES', madrid: 'ES', ibiza: 'ES',
  germany: 'DE', berlin: 'DE', munich: 'DE',
  netherlands: 'NL', amsterdam: 'NL',
  switzerland: 'CH', zurich: 'CH', interlaken: 'CH',
  portugal: 'PT', lisbon: 'PT', porto: 'PT',
  greece: 'GR', athens: 'GR', santorini: 'GR',
  turkey: 'TR', istanbul: 'TR',
  'united arab emirates': 'AE', uae: 'AE', dubai: 'AE', 'abu dhabi': 'AE',
  singapore: 'SG',
  malaysia: 'MY', 'kuala lumpur': 'MY', langkawi: 'MY',
  vietnam: 'VN', hanoi: 'VN', 'da nang': 'VN',
  'sri lanka': 'LK', colombo: 'LK',
  nepal: 'NP', kathmandu: 'NP', pokhara: 'NP',
  bhutan: 'BT',
  maldives: 'MV',
  australia: 'AU', sydney: 'AU', melbourne: 'AU',
  'new zealand': 'NZ', auckland: 'NZ', queenstown: 'NZ',
  canada: 'CA', toronto: 'CA', vancouver: 'CA',
  mexico: 'MX', cancun: 'MX',
  brazil: 'BR', rio: 'BR',
  'south africa': 'ZA', 'cape town': 'ZA',
  egypt: 'EG', cairo: 'EG',
  kenya: 'KE', nairobi: 'KE',
  china: 'CN', beijing: 'CN', shanghai: 'CN',
  'south korea': 'KR', korea: 'KR', seoul: 'KR',
  philippines: 'PH', manila: 'PH',
  iceland: 'IS', reykjavik: 'IS',
  norway: 'NO', sweden: 'SE', denmark: 'DK', finland: 'FI', ireland: 'IE', dublin: 'IE',
  austria: 'AT', vienna: 'AT', czech: 'CZ', prague: 'CZ', hungary: 'HU', budapest: 'HU',
  croatia: 'HR', belgium: 'BE', poland: 'PL', morocco: 'MA', marrakech: 'MA',
};

const FALLBACK = '✈️';

const toEmoji = (code) =>
  String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Longest names first so "new zealand" wins over a shorter accidental match.
const KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length);

export const tripFlag = (location = '') => {
  const text = ` ${location.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const key = KEYS.find((k) => text.includes(` ${k} `));
  return key ? toEmoji(PLACES[key]) : FALLBACK;
};
