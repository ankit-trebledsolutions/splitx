import client from './client';

export const fetchMessages = async (groupId, params = {}) => {
  const { data } = await client.get(`/groups/${groupId}/messages`, { params });
  return data.data.messages;
};

// `replyTo` is the id of the message being answered, if any.
export const sendMessage = async (groupId, text, replyTo) => {
  const { data } = await client.post(`/groups/${groupId}/messages`, {
    text,
    ...(replyTo ? { replyTo } : {}),
  });
  return data.data.message;
};

/**
 * Multipart upload of a photo, voice note or document into the chat. `file` is
 * { uri, name, type }; `durationMs` is sent for voice notes so the bubble can
 * show their length without downloading the audio.
 */
export const sendAttachment = async (groupId, file, { text, durationMs, replyTo } = {}) => {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.type });
  if (text) form.append('text', text);
  if (durationMs) form.append('durationMs', String(Math.round(durationMs)));
  if (replyTo) form.append('replyTo', replyTo);

  const { data } = await client.post(`/groups/${groupId}/messages/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.data.message;
};

// "Delete for everyone". Resolves to the message as it now stands: an empty
// placeholder with `deletedAt` set.
export const deleteMessage = async (groupId, messageId) => {
  const { data } = await client.delete(`/groups/${groupId}/messages/${messageId}`);
  return data.data.message;
};
