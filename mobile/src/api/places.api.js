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
