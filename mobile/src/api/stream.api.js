import client from './client';

// Exchanges our JWT for a Stream token: { apiKey, token, user: { id, name } }.
export const streamTokenRequest = async () => {
  const { data } = await client.get('/stream/token');
  return data.data;
};

// Drops a "call started" / "Call ended" system message into the group chat,
// and makes the other members' phones ring (or stop ringing).
// `event` is 'started' or 'ended'; `video` (with 'started') is whether the
// call began with the camera on, which is what their phones show.
export const postCallEvent = async (groupId, event, { video } = {}) => {
  const { data } = await client.post('/stream/call-event', { groupId, event, video });
  return data.data;
};

// Asked before joining a group's call at all, started or not. Stream lets only
// a call's members in, and the server makes them the group's members (creating
// the call the first time a group calls). Resolves to { live }; rejects with
// 403 for someone not in the group. A server from before this answers 404
// "Route not found" (see isOldServer).
export const prepareCall = async (groupId) => {
  const { data } = await client.post('/stream/call-join', { groupId });
  return data.data;
};

// The server has no such endpoint yet: it is from before this build.
export const isOldServer = (err) =>
  err?.status === 404 && /^Route not found/.test(err?.message ?? '');

// Asked just before starting a call in an empty room. While calls cost
// credits the server charges the caller's first block here, so someone who
// cannot pay is stopped before anyone's phone rings. Resolves to
// { billed: false } or { billed: true, price, blockMinutes }; rejects with
// code 'NO_CREDITS' (402) when they cannot pay.
export const startCall = async (groupId) => {
  const { data } = await client.post('/stream/call-start', { groupId });
  return data.data;
};
