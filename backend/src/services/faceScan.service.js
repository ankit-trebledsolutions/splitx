const Face = require('../models/Face');
const Photo = require('../models/Photo');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const storage = require('../storage');
const faceService = require('./faceService.client');

/**
 * Face Scan: "find the photos this person is in".
 *
 * Two halves. At upload, the worker (faceScan.worker.js) sends each photo to
 * the face service once and keeps a fingerprint per face here (indexPhoto).
 * At scan time, the picture the member took is fingerprinted the same way and
 * compared with the fingerprints already kept for that group (search): a dot
 * product per stored face, a few milliseconds for a trip's worth of photos.
 * Nothing is scanned at search time but the one picture sent.
 *
 * A scan only ever looks inside one group, by one of its members. The picture
 * sent is not kept, and neither are face crops: only the numbers.
 */

// Faces kept per uploaded photo (the largest). Beyond this it is a crowd.
const INDEX_MAX_FACES = 30;
// Faces the scanned picture may offer to choose between.
const QUERY_MAX_FACES = 6;
// Matching photos returned per face, best first.
const MAX_MATCHES = 300;

const USER_FIELDS = 'name email';
const PHOTO_POPULATE = [
  { path: 'uploadedBy', select: USER_FIELDS },
  { path: 'taggedMembers', select: USER_FIELDS },
];

// The fingerprint as stored: float32, little-endian (see models/Face.js).
const toBuffer = (embedding) => Buffer.from(Float32Array.from(embedding).buffer);

// Back to numbers. A copy, not a view: a Buffer out of a BSON document starts
// at any byte, and a Float32Array needs a 4-byte boundary.
const toVector = (stored) => {
  if (Array.isArray(stored)) return Float32Array.from(stored);
  const bytes = Buffer.isBuffer(stored) ? stored : stored?.buffer ? Buffer.from(stored.buffer) : null;
  if (!bytes || !bytes.length || bytes.length % 4 !== 0) return null;
  return new Float32Array(new Uint8Array(bytes).buffer);
};

// Cosine similarity of two unit vectors: 1 identical, 0 unrelated. Vectors of
// different lengths (different models) never match.
const similarity = (a, b) => {
  if (a.length !== b.length) return -1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
};

const isIndexable = (photo) => photo.mediaType !== 'video' && Boolean(photo.storageKey);

/**
 * Fingerprints one photo's faces and replaces whatever was kept for it.
 * Resolves to the number of faces. `photo` must carry storageKey (hidden by
 * default: select '+storageKey'). Throws FaceServiceError from the service
 * and plain errors from storage; the worker decides what each means.
 */
const indexPhoto = async (photo) => {
  const bytes = await storage.read(photo.storageKey, photo.storageProvider);
  const { model, faces } = await faceService.detectFaces(bytes, {
    det: env.faceScan.indexDetSize,
    limit: INDEX_MAX_FACES,
  });
  await Face.deleteMany({ photo: photo._id });
  if (faces.length) {
    await Face.insertMany(
      faces.map((face) => ({
        photo: photo._id,
        group: photo.group,
        box: face.box,
        score: face.score,
        model,
        embedding: toBuffer(face.embedding),
      }))
    );
  }
  return faces.length;
};

// Photos in a group the worker has not finished with.
const pendingCount = (groupId) =>
  Photo.countDocuments({ group: groupId, 'faceScan.status': { $in: ['pending', 'running'] } });

const status = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return { enabled: faceService.enabled(), pending: await pendingCount(groupId) };
};

/**
 * The scan. `buffer` is the picture the member sent (a selfie, or a photo
 * they picked). Resolves to:
 *
 *   {
 *     width, height,            the picture, the right way up
 *     faces: [{                 largest face first
 *       box,                    where it is, fractions of width/height
 *       matches: [{ photo, similarity }]   this group's photos showing the
 *     }],                       same person, best first
 *     pending,                  photos the worker has not scanned yet
 *     threshold                 the similarity a match needed
 *   }
 *
 * A photo counts once per face, by its best-matching face.
 */
const search = async (groupId, userId, { buffer, mimeType }) => {
  await groupService.getGroupForMember(groupId, userId);

  let detected;
  try {
    detected = await faceService.detectFaces(buffer, {
      mimeType,
      det: env.faceScan.queryDetSize,
      limit: QUERY_MAX_FACES,
    });
  } catch (err) {
    if (!(err instanceof faceService.FaceServiceError)) throw err;
    if (err.reason === 'unreadable') {
      throw new ApiError(422, 'That picture could not be read. Try another photo.', {
        code: 'FACE_SCAN_UNREADABLE',
      });
    }
    console.error('[face-scan] service unavailable:', err.message);
    throw new ApiError(503, 'Face Scan is not available right now. Try again in a little while.', {
      code: 'FACE_SCAN_UNAVAILABLE',
    });
  }
  if (!detected.faces.length) {
    throw new ApiError(422, 'No face was found in that picture. Try a clearer, front-facing photo.', {
      code: 'FACE_NOT_FOUND',
    });
  }

  const queries = detected.faces.map((face) => ({
    box: face.box,
    vector: Float32Array.from(face.embedding),
    best: new Map(), // photo id -> best similarity
  }));

  // Only fingerprints the same model made are comparable with the new one.
  const stored = await Face.find({ group: groupId, model: detected.model }).select('photo embedding').lean();
  for (const face of stored) {
    const vector = toVector(face.embedding);
    if (!vector) continue;
    const photoId = String(face.photo);
    for (const query of queries) {
      const score = similarity(query.vector, vector);
      if (score >= env.faceScan.matchThreshold && score > (query.best.get(photoId) ?? -1)) {
        query.best.set(photoId, score);
      }
    }
  }

  const photoIds = new Set();
  for (const query of queries) for (const id of query.best.keys()) photoIds.add(id);
  const photos = photoIds.size
    ? await Photo.find({ _id: { $in: [...photoIds] }, group: groupId }).populate(PHOTO_POPULATE)
    : [];
  const byId = new Map(photos.map((photo) => [String(photo._id), photo]));

  const faces = queries.map((query) => ({
    box: query.box,
    matches: [...query.best.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MATCHES)
      .map(([id, score]) => ({ photo: byId.get(id), similarity: Math.round(score * 1000) / 1000 }))
      .filter((match) => match.photo),
  }));

  return {
    width: detected.width,
    height: detected.height,
    faces,
    pending: await pendingCount(groupId),
    threshold: env.faceScan.matchThreshold,
  };
};

// Clean-up, called wherever photos go.
const removeForPhotos = (photoIds) =>
  photoIds.length ? Face.deleteMany({ photo: { $in: photoIds } }) : Promise.resolve();
const removeForGroup = (groupId) => Face.deleteMany({ group: groupId });

module.exports = {
  indexPhoto,
  search,
  status,
  pendingCount,
  removeForPhotos,
  removeForGroup,
  isIndexable,
  toBuffer,
  toVector,
  similarity,
  INDEX_MAX_FACES,
  QUERY_MAX_FACES,
  MAX_MATCHES,
};
