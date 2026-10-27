const env = require('../config/env');

/**
 * The one way to the face service (face-service/app.py): a photo in, the faces
 * in it out. The service is a container next to the API (docker-compose.yml)
 * that nothing else can reach; this file is the only place its URL and answer
 * shape are known.
 */

class FaceServiceError extends Error {
  /**
   * reason:
   *   'unavailable'  not configured, cannot be reached, timed out, or failed
   *                  on its side; the photo may well be fine, try later
   *   'unreadable'   the service could not read this photo; trying again
   *                  will not help
   */
  constructor(message, reason, status = null) {
    super(message);
    this.name = 'FaceServiceError';
    this.reason = reason;
    this.status = status;
  }
}

// Everything that leaves this process goes through here, so tests can replace
// it without a server (the fake in scripts/fake-face.js is the other option).
const outside = {
  fetch: (url, options) => fetch(url, options),
};

const enabled = () => Boolean(env.faceScan.serviceUrl);

const isVector = (value, dim) =>
  Array.isArray(value) &&
  value.length === dim &&
  value.length > 0 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isBox = (value) =>
  Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number' && n >= 0 && n <= 1);

// The service's answer, checked field by field: a wrong build of it must fail
// here, not as a kilobyte of NaN in the database.
const parse = (data) => {
  if (!data || !Array.isArray(data.faces)) throw new Error('no faces list');
  const model = typeof data.model === 'string' ? data.model : '';
  const dim = Number(data.dim) || data.faces[0]?.embedding?.length || 0;
  const faces = data.faces.map((face, i) => {
    if (!isBox(face?.box)) throw new Error(`face ${i}: bad box`);
    if (!isVector(face.embedding, dim)) throw new Error(`face ${i}: bad embedding`);
    return { box: face.box, score: Number(face.score) || 0, embedding: face.embedding };
  });
  return { model, dim, width: Number(data.width) || 0, height: Number(data.height) || 0, faces };
};

/**
 * The faces in a photo: { model, dim, width, height, faces: [{ box, score,
 * embedding }] }, largest face first. `model` names what made the
 * fingerprints (only fingerprints from the same model compare); `det` is the
 * detector's working size (bigger finds smaller faces, slower); `limit` caps
 * how many faces come back.
 */
const detectFaces = async (buffer, { mimeType = 'application/octet-stream', det = 640, limit = 20 } = {}) => {
  if (!enabled()) throw new FaceServiceError('Face Scan is not set up on this server', 'unavailable');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), 'photo');
  const url = `${env.faceScan.serviceUrl}/faces?det=${det}&limit=${limit}`;

  let response;
  try {
    response = await outside.fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(env.faceScan.timeoutMs),
    });
  } catch (err) {
    throw new FaceServiceError(`The face service could not be reached: ${err.message}`, 'unavailable');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const reason = response.status >= 400 && response.status < 500 ? 'unreadable' : 'unavailable';
    throw new FaceServiceError(
      `The face service answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      reason,
      response.status
    );
  }

  try {
    return parse(await response.json());
  } catch (err) {
    throw new FaceServiceError(`The face service answered with an unexpected shape: ${err.message}`, 'unavailable');
  }
};

module.exports = { detectFaces, enabled, outside, FaceServiceError };
