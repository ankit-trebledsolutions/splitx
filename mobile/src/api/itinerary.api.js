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

// Edits one activity in place. An empty string clears a field; `targetDayId`
// moves the activity to another day of the same trip. Resolves to
// { day, targetDay }: the day it was in, and (after a move) the day it is in now.
export const updateItineraryActivity = async (dayId, activityId, patch) => {
  const { data } = await client.patch(`/itinerary-days/${dayId}/activities/${activityId}`, patch);
  return data.data;
};

// ---- AI itinerary ---------------------------------------------------------

// Starts AI planning. The server answers at once with the job (status
// 'running') and plans in the background; completion arrives over the socket
// (`itinerary:ai`), by polling fetchItineraryGeneration, and as a push.
export const generateItinerary = async (groupId, body) => {
  const { data } = await client.post(`/groups/${groupId}/itinerary/generate`, body);
  return data.data.job;
};

// { configured, job, lastPrefs, destinationEditable, serverNow }
export const fetchItineraryGeneration = async (groupId) => {
  const { data } = await client.get(`/groups/${groupId}/itinerary/generate`);
  return data.data;
};
