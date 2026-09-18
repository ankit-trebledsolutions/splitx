/**
 * One-time move of gallery photos from the local uploads folder to Cloudinary.
 *
 *   node scripts/migrate-photos-to-cloudinary.js            dry run: only reports
 *   node scripts/migrate-photos-to-cloudinary.js --apply    upload + update the database
 *   node scripts/migrate-photos-to-cloudinary.js --apply --prune
 *                                                           also delete gallery entries whose
 *                                                           file no longer exists anywhere
 *
 * Safe to re-run: photos already on Cloudinary are skipped. Local files are
 * left in place; delete backend/uploads yourself once you've checked the app.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const connectDB = require('../src/config/db');
const Photo = require('../src/models/Photo');
const cloudinaryStorage = require('../src/storage/cloudinary.storage');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const apply = process.argv.includes('--apply');
const prune = process.argv.includes('--prune');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' };

(async () => {
  if (!env.cloudinary) {
    console.error('Cloudinary is not configured. Add the three CLOUDINARY_* values to backend/.env first.');
    process.exit(1);
  }
  await connectDB();

  const photos = await Photo.find({ imageUrl: /^\/uploads\// });
  console.log(`${photos.length} photo(s) still point at the local uploads folder${apply ? '' : ' (dry run)'}\n`);

  let moved = 0;
  let missing = 0;
  let failed = 0;
  for (const photo of photos) {
    const filename = path.basename(photo.imageUrl);
    const file = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(file)) {
      missing += 1;
      console.log(`  missing   ${filename}  (uploaded on another machine, or already wiped)`);
      if (apply && prune) await photo.deleteOne();
      continue;
    }
    if (!apply) {
      console.log(`  would move ${filename}  (${Math.round(fs.statSync(file).size / 1024)} KB)`);
      continue;
    }
    try {
      const ext = path.extname(filename).slice(1).toLowerCase();
      const stored = await cloudinaryStorage.upload(
        { buffer: fs.readFileSync(file), mimetype: MIME[ext] ?? 'image/jpeg', originalname: filename },
        { folder: `splix/groups/${photo.group}` }
      );
      photo.imageUrl = stored.url;
      photo.thumbUrl = stored.thumbUrl;
      photo.storageProvider = 'cloudinary';
      photo.storageKey = stored.key;
      await photo.save();
      moved += 1;
      console.log(`  moved     ${filename}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAILED    ${filename}: ${err.message}`);
    }
  }

  console.log(`\nmoved: ${moved}   missing: ${missing}${prune && apply ? ' (entries deleted)' : ''}   failed: ${failed}`);
  if (!apply) console.log('Nothing was changed. Re-run with --apply to do it.');
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
