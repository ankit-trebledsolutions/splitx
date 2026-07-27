const Photo = require('../models/Photo');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

const USER_FIELDS = 'name email';
const POPULATE = [
  { path: 'uploadedBy', select: USER_FIELDS },
  { path: 'taggedMembers', select: USER_FIELDS },
];

const listPhotos = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Photo.find({ group: groupId }).populate(POPULATE).sort({ createdAt: -1 });
};

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
    caption: payload.caption,
    taggedMembers,
    uploadedBy: userId,
  });

  await photo.populate(POPULATE);

  const uploader = group.members.find((m) => m._id.equals(userId))?.name ?? 'A member';
  await messageService.postSystem(groupId, `${uploader} added a photo to the gallery`);

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'photo',
    title: 'Photo Added',
    body: `${uploader} added a photo to the "${group.name}" gallery.`,
  });

  return photo;
};

const getPhotoForMember = async (photoId, userId) => {
  const photo = await Photo.findById(photoId).populate(POPULATE);
  if (!photo) throw ApiError.notFound('Photo not found');
  await groupService.getGroupForMember(photo.group, userId);
  return photo;
};

const deletePhoto = async (photoId, userId) => {
  const photo = await getPhotoForMember(photoId, userId);
  if (!photo.uploadedBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the member who uploaded this photo can delete it');
  }
  await photo.deleteOne();
};

module.exports = { listPhotos, addPhoto, getPhotoForMember, deletePhoto };
