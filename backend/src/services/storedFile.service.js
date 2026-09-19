const Message = require('../models/Message');
const Photo = require('../models/Photo');
const storage = require('../storage');

/**
 * A photo sent in the chat is also listed in the group gallery, so one stored
 * file can be behind both a message and a gallery photo. Deleting either must
 * not pull the file out from under the other: call this *after* removing the
 * row, and the file only goes once nothing points at it any more.
 */
const removeIfUnused = async ({ url, key, provider }) => {
  if (!url || !key) return;
  const [inChat, inGallery] = await Promise.all([
    Message.exists({ 'attachment.url': url }),
    Photo.exists({ imageUrl: url }),
  ]);
  if (!inChat && !inGallery) await storage.remove(key, provider);
};

module.exports = { removeIfUnused };
