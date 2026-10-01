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
