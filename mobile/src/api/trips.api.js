import client from './client';

// { trips: [...], stats: {...} } for the Trips tab, soonest/ongoing first.
export const fetchTrips = async () => {
  const { data } = await client.get('/trips');
  return data.data;
};
