const { v2: cloudinary } = require('cloudinary');
const env = require('../config/env');

if (env.cloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

// Grid tiles are small squares; Cloudinary resizes on the fly from the URL and
// caches the result, so nothing extra is stored. g_auto keeps faces in frame.
const THUMB_TRANSFORM = 'c_fill,g_auto,w_400,h_400,q_auto,f_auto';

const upload = (file, { folder = 'splix' } = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Phones upload HEIC; store a format every device can display and download.
        format: 'jpg',
      },
      (err, result) => {
        if (err) return reject(new Error(err.message || 'Image upload failed'));
        return resolve({
          url: result.secure_url,
          thumbUrl: result.secure_url.replace('/upload/', `/upload/${THUMB_TRANSFORM}/`),
          key: result.public_id,
        });
      }
    );
    stream.end(file.buffer);
  });

// invalidate: also clears Cloudinary's CDN copies, so a deleted photo is really gone.
const remove = async (key) => {
  await cloudinary.uploader.destroy(key, { resource_type: 'image', invalidate: true });
};

module.exports = { upload, remove };
