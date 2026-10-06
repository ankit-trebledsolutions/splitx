/**
 * One-time move of every uploaded file from Cloudinary to Cloudflare R2.
 *
 * Run it on the server, where the API container already has the database and
 * the R2 keys:
 *
 *   docker compose exec api node scripts/migrate-files-to-r2.js           dry run: counts, changes nothing
 *   docker compose exec api node scripts/migrate-files-to-r2.js --apply   copies the files, repoints the database
 *
 * Safe to stop and run again: only rows still holding a Cloudinary address are
 * picked up, and a row stops holding one the moment its copy is in R2. Nothing
 * is deleted from Cloudinary; close that account once the app has been checked.
 *
 * A photo sent in the chat is also a gallery photo with the same address. It is
 * copied once and both rows are pointed at the copy, so deleting one of them
 * still leaves the file for the other (services/storedFile.service.js).
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const connectDB = require('../src/config/db');
const integrations = require('../src/integrations/store');
const r2Storage = require('../src/storage/r2.storage');
const Photo = require('../src/models/Photo');
const Message = require('../src/models/Message');

const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\//;
const DOWNLOAD_TIMEOUT_MS = 60 * 1000;
// A few at a time: quicker than one by one, gentle on a small server's memory.
const AT_ONCE = 4;

const download = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Cloudinary answered ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: (res.headers.get('content-type') || '').split(';')[0].trim(),
  };
};

// Every Cloudinary address still in use, once each, with what it takes to
// store it again. Chat rows go first: they know the file's original name.
const findFiles = async () => {
  const [photos, messages] = await Promise.all([
    Photo.find({ imageUrl: CLOUDINARY }).select('imageUrl group').lean(),
    Message.find({ 'attachment.url': CLOUDINARY }).select('attachment group').lean(),
  ]);
  const files = new Map();
  for (const message of messages) {
    const { url, name, mimeType } = message.attachment;
    files.set(url, { url, folder: `splix/groups/${message.group}/chat`, name, mimeType });
  }
  for (const photo of photos) {
    if (!files.has(photo.imageUrl)) {
      files.set(photo.imageUrl, { url: photo.imageUrl, folder: `splix/groups/${photo.group}`, name: '', mimeType: '' });
    }
  }
  return { files: [...files.values()], photos: photos.length, messages: messages.length };
};

const lastSegment = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'file';
  } catch {
    return 'file';
  }
};

// Cloudinary turned every photo into a JPG, so for images the downloaded type
// and the address's own name are the truth. Documents keep the name they were
// sent with, which is what people see in the chat.
const describe = (file, contentType) => {
  const mimetype =
    contentType && contentType !== 'application/octet-stream'
      ? contentType
      : file.mimeType || 'application/octet-stream';
  const originalname = /^image\//.test(mimetype) || !file.name ? lastSegment(file.url) : file.name;
  return { mimetype, originalname };
};

const moveOne = async (file, { get, store }) => {
  const { buffer, contentType } = await get(file.url);
  const stored = await store(
    { buffer, size: buffer.length, ...describe(file, contentType) },
    { folder: file.folder }
  );
  // Each row is right on its own, so if one of these fails the other may still
  // land; a rerun copies the file again for the row left behind.
  await Photo.updateMany(
    { imageUrl: file.url },
    { $set: { imageUrl: stored.url, thumbUrl: stored.thumbUrl, storageProvider: 'r2', storageKey: stored.key } }
  );
  await Message.updateMany(
    { 'attachment.url': file.url },
    {
      $set: {
        'attachment.url': stored.url,
        'attachment.thumbUrl': stored.thumbUrl,
        'attachment.storageProvider': 'r2',
        'attachment.storageKey': stored.key,
      },
    }
  );
};

const run = async ({ apply = false, log = console.log, get = download, store = r2Storage.upload } = {}) => {
  const { files, photos, messages } = await findFiles();
  log(`Still on Cloudinary: ${photos} gallery photo(s) and ${messages} chat file(s), ${files.length} file(s) in all.`);
  if (!apply) {
    if (files.length) log('Dry run, nothing changed. Run again with --apply to copy them to R2.');
    return { total: files.length, moved: 0, failed: [] };
  }

  let moved = 0;
  let done = 0;
  const failed = [];
  const queue = [...files];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      try {
        await moveOne(file, { get, store });
        moved += 1;
        log(`[${++done}/${files.length}] moved ${file.url}`);
      } catch (err) {
        failed.push({ url: file.url, reason: err.message });
        log(`[${++done}/${files.length}] FAILED ${file.url}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, files.length) }, worker));

  log(`Moved ${moved} of ${files.length}.`);
  if (failed.length) {
    log(`${failed.length} could not be moved and still load from Cloudinary. Run again to retry them.`);
  }
  return { total: files.length, moved, failed };
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();
  // Keys saved in the admin panel count as much as the ones in backend/.env.
  await integrations.start();
  try {
    if (!integrations.r2()) {
      console.error('Cloudflare R2 is not set up. Add the R2_* values to backend/.env (or the admin panel) first.');
      process.exitCode = 1;
      return;
    }
    if (apply && !env.mediaBaseUrl) {
      console.error(
        'Set MEDIA_BASE_URL in backend/.env first (for example https://srv123456.hstgr.cloud/media), so the new addresses work in every copy of the app.'
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Database: ${mongoose.connection.host}   Files will be served from: ${env.mediaBaseUrl || '/media'}`);
    const { failed } = await run({ apply });
    if (failed.length) process.exitCode = 1;
  } finally {
    integrations.stop();
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration stopped:', err.message);
    process.exit(1);
  });
}

module.exports = { run, describe, CLOUDINARY };
