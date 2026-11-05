/**
 * How a stored file may be shown when someone opens its link.
 *
 * Chat attachments can be any type, and the type is whatever the sender's
 * phone (or a hand-made request) claimed. A file a browser would run as a page
 * (HTML, SVG, XML...) must never be shown inline: opened from a link, it would
 * run with the storage origin's rights, which for the local uploads folder is
 * this API's own origin. So only pictures, video, audio and PDF are shown in
 * place; everything else is a download, and the local folder adds a sandbox
 * policy so even a download opened in place runs nothing.
 */

// By declared type (R2 stores the type with the file).
const INLINE_TYPE = /^(image\/(jpeg|png|gif|webp|heic|heif|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

// By extension (the local folder is served by express.static, which picks the
// type from the extension the uploader chose).
const INLINE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|mp4|m4v|mov|webm|3gp|mkv|mp3|m4a|aac|ogg|oga|opus|wav|amr|pdf)$/i;

const showsInline = (mimetype) => INLINE_TYPE.test(String(mimetype || ''));

const dispositionFor = (mimetype, name) => `${showsInline(mimetype) ? 'inline' : 'attachment'}; filename="${name}"`;

// express.static setHeaders for /uploads.
const setLocalHeaders = (res, filePath) => {
  if (INLINE_EXT.test(filePath)) return;
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
};

module.exports = { showsInline, dispositionFor, setLocalHeaders, INLINE_TYPE, INLINE_EXT };
