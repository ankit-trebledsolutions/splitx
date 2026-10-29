import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';

// Match the server's limits (backend middleware/upload.js).
export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

// Both have a native half that builds from before videos lack. Check first: a
// failing require() is a fatal red screen in Metro and cannot be caught (see
// utils/attachments.js). Without the player, videos open in another app;
// without the thumbnail module, they upload with no poster frame.
export const canPlayVideos = () => Boolean(requireOptionalNativeModule('ExpoVideo'));
const canMakePosters = () => Boolean(requireOptionalNativeModule('ExpoVideoThumbnails'));

export const isVideo = (item) => item?.mediaType === 'video';

/**
 * A frame of a picked video as a local JPEG, sent along with the video so its
 * gallery tile and chat card have a picture. A second in, unless the clip is
 * shorter than two. Resolves to null when no frame can be had.
 */
export const makePoster = async (uri, durationMs = 0) => {
  if (!canMakePosters()) return null;
  const { getThumbnailAsync } = require('expo-video-thumbnails');
  try {
    const frame = await getThumbnailAsync(uri, { time: durationMs > 2000 ? 1000 : 0, quality: 0.7 });
    // The frame keeps the video's own resolution, so an 8K clip's can be too
    // big to send; the server would leave it out anyway. (0: unreadable.)
    const { size } = new File(frame.uri);
    return size > 0 && size <= MAX_POSTER_BYTES ? frame.uri : null;
  } catch {
    return null;
  }
};
