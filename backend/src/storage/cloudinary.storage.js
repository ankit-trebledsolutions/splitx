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

const isImage = (file) => /^image\//.test(file.mimetype);

// Images are what the gallery has always stored. Anything else (chat voice
// notes and documents) lets Cloudinary pick the resource type: audio lands
// under "video", documents under "raw". Raw files keep their extension only if
// the public id carries the filename, hence filename_override.
const uploadOptions = (file, folder) =>
  isImage(file)
    ? {
        folder,
        resource_type: 'image',
        // Phones upload HEIC; store a format every device can display and download.
        format: 'jpg',
      }
    : {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
        filename_override: (file.originalname || 'file').replace(/[^a-z0-9._-]/gi, '_').slice(-60),
      };

const upload = (file, { folder = 'splix' } = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(uploadOptions(file, folder), (err, result) => {
      if (err) return reject(new Error(err.message || 'Upload failed'));
      const image = result.resource_type === 'image';
      return resolve({
        url: result.secure_url,
        thumbUrl: image
          ? result.secure_url.replace('/upload/', `/upload/${THUMB_TRANSFORM}/`)
          : result.secure_url,
        // Deleting needs the resource type too. Image keys stay a bare public id,
        // as they were before other types existed; the rest carry a prefix.
        key: image ? result.public_id : `${result.resource_type}:${result.public_id}`,
      });
    });
    stream.end(file.buffer);
  });

// invalidate: also clears Cloudinary's CDN copies, so a deleted file is really gone.
const remove = async (key) => {
  const [, resourceType = 'image', publicId = key] = /^(video|raw):(.+)$/.exec(key) ?? [];
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
};

module.exports = { upload, remove };
