const Photo = require('../models/Photo');
const env = require('../config/env');
const faceScanService = require('./faceScan.service');
const { FaceServiceError } = require('./faceService.client');

/**
 * The upload side of Face Scan: a loop in this process that takes each new
 * gallery photo through the face service once and keeps its faces (see
 * faceScan.service.indexPhoto). One photo at a time, newest first, so a burst
 * of uploads slows the tagging down and never the API.
 *
 * The queue is the photos themselves (Photo.faceScan.status): `pending` is
 * waiting, `running` is in hand, then `done`, `skipped` or `failed`. Nothing
 * about a photo lives only in this process's memory, so a restart carries on
 * where it left off. Photos from before Face Scan are adopted at start-up and
 * scanned after anything newer.
 *
 * Runs only when FACE_SERVICE_URL is set (and FACE_SCAN_WORKER is not "off"),
 * and expects to be the only copy: a second API process would scan the same
 * photos twice (harmless, as a scan replaces the previous faces) and
 * re-queue the other's photos as stale.
 */
const IDLE_POLL_MS = 5 * 1000;
// After the face service could not be reached: give it a moment to come back
// rather than burning through the queue's attempts.
const UNAVAILABLE_RETRY_MS = 30 * 1000;
const MAX_ATTEMPTS = 3;

let timer = null;
let busy = false;
let stopped = true;

const enabled = () => Boolean(env.faceScan.serviceUrl) && env.faceScan.worker;

const schedule = (ms) => {
  clearTimeout(timer);
  if (stopped) return;
  timer = setTimeout(tick, ms); // eslint-disable-line no-use-before-define
  timer.unref();
};

// Photos from before this feature have no status. Images with a stored file
// join the queue; videos, emoji tiles and URL-only rows are marked skipped so
// the queue query stays small.
const adoptOld = async () => {
  await Photo.updateMany(
    {
      'faceScan.status': { $exists: false },
      mediaType: { $ne: 'video' },
      storageKey: { $exists: true, $nin: ['', null] },
    },
    { $set: { 'faceScan.status': 'pending', 'faceScan.faces': 0, 'faceScan.attempts': 0 } },
    { timestamps: false }
  );
  await Photo.updateMany(
    { 'faceScan.status': { $exists: false } },
    { $set: { 'faceScan.status': 'skipped', 'faceScan.faces': 0, 'faceScan.attempts': 0 } },
    { timestamps: false }
  );
};

// Whatever was in hand when the previous process died.
const requeueRunning = () =>
  Photo.updateMany(
    { 'faceScan.status': 'running' },
    { $set: { 'faceScan.status': 'pending' } },
    { timestamps: false }
  );

// Claimed in one step: the row is `running` before anything else is done with it.
const claim = () =>
  Photo.findOneAndUpdate(
    { 'faceScan.status': 'pending', mediaType: { $ne: 'video' } },
    { $set: { 'faceScan.status': 'running', 'faceScan.startedAt': new Date() }, $inc: { 'faceScan.attempts': 1 } },
    { sort: { createdAt: -1 }, new: true, timestamps: false }
  ).select('+storageKey');

const settle = (photo, fields, extra = {}) =>
  Photo.updateOne({ _id: photo._id }, { $set: fields, ...extra }, { timestamps: false });

/**
 * One photo through the service. Resolves to 'next' (look for another at
 * once) or 'wait' (the service is unavailable: pause before trying again).
 */
const scan = async (photo) => {
  if (!faceScanService.isIndexable(photo)) {
    await settle(photo, { 'faceScan.status': 'skipped', 'faceScan.faces': 0 });
    return 'next';
  }
  try {
    const faces = await faceScanService.indexPhoto(photo);
    await settle(photo, {
      'faceScan.status': 'done',
      'faceScan.faces': faces,
      'faceScan.scannedAt': new Date(),
      'faceScan.error': null,
    });
    return 'next';
  } catch (err) {
    if (err instanceof FaceServiceError && err.reason === 'unavailable') {
      // Not this photo's fault: back in the queue with its attempt given back.
      await settle(photo, { 'faceScan.status': 'pending' }, { $inc: { 'faceScan.attempts': -1 } });
      console.error(`[face-scan] service unavailable, trying again in ${UNAVAILABLE_RETRY_MS / 1000}s:`, err.message);
      return 'wait';
    }
    const attempts = photo.faceScan?.attempts ?? MAX_ATTEMPTS;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await settle(photo, {
      'faceScan.status': giveUp ? 'failed' : 'pending',
      'faceScan.error': String(err.message || err).slice(0, 200),
    });
    console.error(
      `[face-scan] could not scan photo ${photo._id} (attempt ${attempts}${giveUp ? ', giving up' : ''}):`,
      err.message
    );
    return 'next';
  }
};

// One pass: the next waiting photo, if any. Resolves to what happened, for tests.
const runOnce = async () => {
  const photo = await claim();
  if (!photo) return 'idle';
  return scan(photo);
};

const tick = async () => {
  if (busy || stopped) return;
  busy = true;
  let delay = IDLE_POLL_MS;
  try {
    const outcome = await runOnce();
    if (outcome === 'next') delay = 0;
    else if (outcome === 'wait') delay = UNAVAILABLE_RETRY_MS;
  } catch (err) {
    console.error('[face-scan] worker pass failed:', err.message);
  } finally {
    busy = false;
  }
  schedule(delay);
};

const start = async () => {
  if (!enabled() || !stopped) return;
  stopped = false;
  try {
    await adoptOld();
    await requeueRunning();
  } catch (err) {
    console.error('[face-scan] could not prepare the queue:', err.message);
  }
  schedule(0);
};

// A photo was just added: look now rather than at the next poll.
const kick = () => {
  if (stopped || busy) return;
  schedule(0);
};

const stop = () => {
  stopped = true;
  clearTimeout(timer);
  timer = null;
};

module.exports = { start, stop, kick, runOnce, enabled, adoptOld, requeueRunning, MAX_ATTEMPTS };
