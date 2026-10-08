const crypto = require('crypto');
const fs = require('fs');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const env = require('../config/env');
const integrations = require('../integrations/store');

/**
 * Cloudflare R2, spoken to through its S3-compatible API.
 *
 * The bucket is private. Each file's address is MEDIA_BASE_URL/<key>: this
 * server's /media route, which answers with a short-lived signed link to R2
 * (see signedUrl), so files load without a domain of our own. Once there is
 * one, R2 can serve the same keys from it and only MEDIA_BASE_URL changes.
 */

// Grid tiles are small squares. R2 cannot resize on the fly, so the square is
// made once, here, and stored next to the file.
const THUMB_SIZE = 400;
const THUMB_SUFFIX = '.thumb.jpg';
// Long enough for a voice note to play through, short enough that a link
// copied out of the app stops working soon after.
const SIGNED_URL_SECONDS = 60 * 60;
// Keys never change (each upload gets a new one), so a copy can be kept forever.
const CACHE_FOREVER = 'public, max-age=31536000, immutable';

const clientFor = (keys) =>
  new S3Client({
    region: 'auto',
    endpoint: `https://${keys.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: keys.accessKeyId, secretAccessKey: keys.secretAccessKey },
    // Checksums only where an operation requires one: the SDK's newer default
    // adds headers to every upload that R2 has not always accepted.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

const refuseInTests = (what) => () => {
  throw new Error(`No outside calls in tests: mock r2.outside.${what}`);
};

// Everything that reaches Cloudflare goes through here, so tests can replace it
// and can never touch a real bucket by forgetting to.
const outside = {
  client: env.nodeEnv === 'test' ? refuseInTests('client') : clientFor,
  sign: (client, command, options) => getSignedUrl(client, command, options),
};

// One client per set of keys: they can be changed in the admin panel while the
// server runs, and a new set must not reuse the old connection.
let cached = { id: '', client: null };
const connection = () => {
  const keys = integrations.r2();
  if (!keys) throw new Error('Cloudflare R2 is not set up');
  const id = crypto
    .createHash('sha256')
    .update([keys.accountId, keys.accessKeyId, keys.secretAccessKey].join('\n'))
    .digest('hex');
  if (cached.id !== id) cached = { id, client: outside.client(keys) };
  return { client: cached.client, bucket: keys.bucket };
};

const isImage = (file) => /^image\//.test(file.mimetype);

// Letters, digits, dot, dash and underscore only: the name ends up in the key,
// in the address and in a header.
const safeName = (name) => String(name || 'file').replace(/[^a-z0-9._-]/gi, '_').slice(-60);

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const addressOf = (key) => `${env.mediaBaseUrl || '/media'}/${encodeKey(key)}`;

// A format sharp cannot read (HEIC from some phones) gets no square; the grid
// then shows the full image, as it does for local storage.
const squareOf = async (buffer) => {
  try {
    return await sharp(buffer, { failOn: 'none' })
      // Phones record which way up a photo is instead of turning the pixels;
      // without this the square comes out on its side.
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
};

// `length` is only needed for a stream, whose size the SDK cannot work out.
const put = (client, bucket, key, body, contentType, name, length) =>
  client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(length !== undefined ? { ContentLength: length } : {}),
      ContentType: contentType || 'application/octet-stream',
      CacheControl: CACHE_FOREVER,
      // Keeps the original name when a document is saved from the link.
      ContentDisposition: `inline; filename="${name}"`,
    })
  );

const drop = (client, bucket, key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

const upload = async (file, { folder = 'splix', poster = null } = {}) => {
  const { client, bucket } = connection();
  const name = safeName(file.originalname);
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(12).toString('hex')}-${name}`;
  // A video's square is made from the frame the phone sent along with it.
  const squareFrom = poster ?? (isImage(file) && file.buffer ? file.buffer : null);
  const square = squareFrom ? await squareOf(squareFrom) : null;
  // Videos arrive on disk and are streamed from there; everything else is in memory.
  const body = file.path ? fs.createReadStream(file.path) : file.buffer;

  try {
    await Promise.all([
      put(client, bucket, key, body, file.mimetype, name, file.path ? file.size : undefined),
      square && put(client, bucket, `${key}${THUMB_SUFFIX}`, square, 'image/jpeg', `thumb-${name}`),
    ]);
  } catch (err) {
    // Whichever half made it in would otherwise sit in the bucket unreferenced.
    await Promise.allSettled([drop(client, bucket, key), square && drop(client, bucket, `${key}${THUMB_SUFFIX}`)]);
    throw new Error(`Upload failed: ${err.message}`);
  }

  return {
    url: addressOf(key),
    thumbUrl: square ? addressOf(`${key}${THUMB_SUFFIX}`) : addressOf(key),
    key,
  };
};

// Deleting a key that is not there succeeds, so the square goes too whether or
// not one was made.
const remove = async (key) => {
  const { client, bucket } = connection();
  await Promise.all([drop(client, bucket, key), drop(client, bucket, `${key}${THUMB_SUFFIX}`)]);
};

// A link straight to the file in the private bucket, valid for an hour.
// Made on this machine from the keys: no call to Cloudflare.
const signedUrl = (key) => {
  const { client, bucket } = connection();
  return outside.sign(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: SIGNED_URL_SECONDS,
  });
};

module.exports = { upload, remove, signedUrl, clientFor, outside, THUMB_SUFFIX, SIGNED_URL_SECONDS };
