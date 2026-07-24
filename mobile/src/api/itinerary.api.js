import client from './client';

export const fetchItinerary = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/itinerary`);
  return data.data.days;
};

export const createItineraryDay = async (groupId, payload) => {
  const { data } = await client.post(`/groups/${groupId}/itinerary`, payload);
  return data.data.day;
};

export const updateItineraryDay = async (dayId, payload) => {
  const { data } = await client.patch(`/itinerary-days/${dayId}`, payload);
  return data.data.day;
};

export const addItineraryActivity = async (dayId, payload) => {
  const { data } = await client.post(`/itinerary-days/${dayId}/activities`, payload);
  return data.data.day;
};

export const removeItineraryActivity = async (dayId, activityId) => {
  const { data } = await client.delete(`/itinerary-days/${dayId}/activities/${activityId}`);
  return data.data.day;
};

export const deleteItineraryDay = async (dayId) => {
  await client.delete(`/itinerary-days/${dayId}`);
};
