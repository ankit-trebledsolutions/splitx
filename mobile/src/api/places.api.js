import client from './client';

// Suggested hotels ('stay') or sights ('attraction') at the group's destination.
// Answers the Suggestions shape:
//   { configured, type, destination: { text, resolved } | null, reason,
//     fetchedAt, items: [{ placeId, name, category, emoji, address, distanceKm, lat, lon }],
//     addedPlaceIds, provider: { name, attribution, url } }
// `configured: false` means the server has no provider key: show nothing.
// `reason` is 'NO_DESTINATION' or 'UNKNOWN_DESTINATION' when there is nothing
// to suggest yet. `refresh` asks the provider again (cached copies older than
// ten minutes only) and counts towards the daily caps.
export const fetchPlaceSuggestions = async (groupId, type, { refresh = false } = {}) => {
  const { data } = await client.get(`/groups/${groupId}/suggestions/${type}`, {
    params: refresh ? { refresh: '1' } : undefined,
  });
  return data.data;
};

// Hotels or sights whose name matches `q`, within the group's destination.
// The same shape as the suggestions plus `query`; items come in the
// provider's order (best name match first). Every new name is one provider
// call on the server, under its own daily caps (PLACES_SEARCH_LIMIT).
export const searchPlaces = async (groupId, type, q) => {
  const { data } = await client.get(`/groups/${groupId}/places/search`, { params: { type, q } });
  return data.data;
};

// The lists a trip's destination is picked from: every country, and the
// states of one country. [{ code, name }], by name.
export const fetchCountries = async () => {
  const { data } = await client.get('/places/countries');
  return data.data.countries;
};

export const fetchStates = async (countryCode) => {
  const { data } = await client.get(`/places/countries/${countryCode}/states`);
  return data.data.states;
};
