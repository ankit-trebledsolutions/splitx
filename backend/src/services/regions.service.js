const ApiError = require('../utils/ApiError');
// country-region-data (MIT): every country with its states or provinces.
const DATA = require('country-region-data/data.json');

/**
 * The lists behind the Country and State fields of a trip: where a group is
 * going, picked rather than typed, so the suggested hotels and sights, and
 * the name search on the Stays and Attractions tabs, can be kept to that one
 * state.
 *
 * The data ships with the server and is served to the app (routes/region),
 * so both sides read the same list and an update here reaches every build.
 * Codes are ISO 3166-1 alpha-2 for countries and the dataset's own short
 * codes (ISO 3166-2 where it has them) for states.
 */

// A state the dataset lists without a code gets one made from its name, so
// every option the app shows can be sent back and found again.
const slugOf = (name) =>
  String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

const statesOf = (regions = []) => {
  const seen = new Set();
  const states = [];
  for (const region of regions) {
    const name = String(region.name ?? '').trim();
    if (!name) continue;
    const code = String(region.shortCode || slugOf(name)).toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    states.push({ code, name });
  }
  return states.sort((a, b) => a.name.localeCompare(b.name, 'en'));
};

const COUNTRIES = DATA.map((country) => ({
  code: String(country.countryShortCode).toUpperCase(),
  name: String(country.countryName).trim(),
  states: statesOf(country.regions),
})).sort((a, b) => a.name.localeCompare(b.name, 'en'));

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

// Without their states: the whole list is a few kilobytes this way.
const COUNTRY_LIST = COUNTRIES.map(({ code, name }) => ({ code, name }));

const listCountries = () => COUNTRY_LIST;

// Null for a country code the list does not have; [] for a country with no states.
const listStates = (countryCode) => BY_CODE.get(String(countryCode ?? '').toUpperCase())?.states ?? null;

/**
 * What the app picked, checked against the list and given its names. The
 * state is optional: a country alone is a destination too. Throws 400 for a
 * code that is not on the list, which only a stale or hand-made client sends.
 */
const resolve = ({ countryCode, stateCode } = {}) => {
  const country = BY_CODE.get(String(countryCode ?? '').toUpperCase());
  if (!country) {
    throw new ApiError(400, 'Pick a country from the list', { code: 'UNKNOWN_COUNTRY' });
  }
  const wanted = String(stateCode ?? '').toUpperCase();
  if (!wanted) {
    return { countryCode: country.code, countryName: country.name, stateCode: '', stateName: '' };
  }
  const state = country.states.find((candidate) => candidate.code === wanted);
  if (!state) {
    throw new ApiError(400, 'Pick a state from the list', { code: 'UNKNOWN_STATE' });
  }
  return { countryCode: country.code, countryName: country.name, stateCode: state.code, stateName: state.name };
};

// "Rajasthan, India", or "Singapore" for a country alone: the text the rest
// of the app shows for the destination.
const labelOf = (destination) => {
  if (!destination?.countryName) return '';
  return destination.stateName ? `${destination.stateName}, ${destination.countryName}` : destination.countryName;
};

module.exports = { listCountries, listStates, resolve, labelOf, slugOf };
