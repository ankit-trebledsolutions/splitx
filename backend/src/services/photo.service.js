const Photo = require('../models/Photo');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');
const storedFileService = require('./storedFile.service');

const USER_FIELDS = 'name email';
const POPULATE = [
  { path: 'uploadedBy', select: USER_FIELDS },
  { path: 'taggedMembers', select: USER_FIELDS },
];

const listPhotos = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Photo.find({ group: groupId }).populate(POPULATE).sort({ createdAt: -1 });
};

// "Photo Added" / "3 Videos Added", and "a photo" / "3 videos" for the body.
const uploadWords = (mediaType, count) => {
  const noun = mediaType === 'video' ? 'video' : 'photo';
  const many = count > 1;
  return {
    title: `${noun[0].toUpperCase()}${noun.slice(1)}${many ? 's' : ''} Added`,
    what: many ? `${count} ${noun}s` : `a ${noun}`,
  };
};

/**
 * A new gallery photo or video. Besides the create fields, uploads may pass:
 *   mediaType   'image' (default) or 'video'
 *   durationMs  a video's length
 *   batch       key shared by the files picked together: they make one chat card
 *   batchCount  how many files that pick had, for the notification's wording
 */
const addPhoto = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  const memberIds = new Set(group.members.map((m) => m._id.toString()));

  const taggedMembers = payload.taggedMembers ?? [];
  for (const tagged of taggedMembers) {
    if (!memberIds.has(tagged.toString())) {
      throw ApiError.badRequest('Tagged members must be group members');
    }
  }

  const photo = await Photo.create({
    group: groupId,
    emoji: payload.emoji,
    color: payload.color,
    imageUrl: payload.imageUrl,
    thumbUrl: payload.thumbUrl,
    storageProvider: payload.storageProvider,
    storageKey: payload.storageKey,
    caption: payload.caption,
    mediaType: payload.mediaType,
    durationMs: payload.durationMs,
    taggedMembers,
    uploadedBy: userId,
  });

  await photo.populate(POPULATE);

  const { created } = await messageService.addToGalleryCard({
    groupId,
    senderId: userId,
    photoId: photo._id,
    batch: payload.batch,
  });

  // Once per card: the rest of a batch joins a card that was already announced.
  if (created) {
    const uploader = group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';
    const { title, what } = uploadWords(photo.mediaType, payload.batchCount ?? 1);
    await notificationService.notifyGroup({
      groupId,
      actorId: userId,
      type: 'photo',
      title,
      body: `${uploader} added ${what} to the "${group.name}" gallery.`,
    });
  }

  return photo;
};

const getPhotoForMember = async (photoId, userId) => {
  const photo = await Photo.findById(photoId).populate(POPULATE);
  if (!photo) throw ApiError.notFound('Photo not found');
  await groupService.getGroupForMember(photo.group, userId);
  return photo;
};

// A photo that came from the chat shares its file with that message, so the
// file only goes once the message is gone too (see storedFile.service).
const fileOf = (url, stored) => ({
  url,
  key: stored?.storageKey,
  provider: stored?.storageProvider,
});

const deletePhoto = async (photoId, userId) => {
  const photo = await getPhotoForMember(photoId, userId);
  if (!photo.uploadedBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the member who uploaded this photo can delete it');
  }
  // storageKey is hidden from normal reads, so fetch it just for the clean-up.
  const stored = await Photo.findById(photoId).select('+storageKey storageProvider');
  await photo.deleteOne();
  await messageService.dropFromGalleryCards([photo._id]);
  await storedFileService.removeIfUnused(fileOf(photo.imageUrl, stored));
};

/**
 * Multi-select delete. Same rule as deletePhoto, applied per photo: only the
 * caller's own uploads go, in groups they still belong to. Anything else in
 * the list is left alone rather than failing the whole batch; the returned ids
 * tell the app what was actually removed.
 */
const deletePhotos = async (photoIds, userId) => {
  const photos = await Photo.find({ _id: { $in: photoIds }, uploadedBy: userId }).select(
    '+storageKey storageProvider group imageUrl'
  );

  const groupIds = [...new Set(photos.map((p) => p.group.toString()))];
  const memberOf = new Set();
  for (const groupId of groupIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await groupService.getGroupForMember(groupId, userId);
      memberOf.add(groupId);
    } catch {
      // Not a member any more: those photos stay.
    }
  }

  const deletable = photos.filter((p) => memberOf.has(p.group.toString()));
  await Photo.deleteMany({ _id: { $in: deletable.map((p) => p._id) } });
  await messageService.dropFromGalleryCards(deletable.map((p) => p._id));
  await Promise.all(deletable.map((p) => storedFileService.removeIfUnused(fileOf(p.imageUrl, p))));
  return deletable.map((p) => p._id);
};

module.exports = { listPhotos, addPhoto, getPhotoForMember, deletePhoto, deletePhotos };
