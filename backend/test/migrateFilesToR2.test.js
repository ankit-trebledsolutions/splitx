require('../testkit/safeEnv');

/**
 * scripts/migrate-files-to-r2.js, the one-time copy of every Cloudinary file
 * into R2.
 *
 * It rewrites addresses in the live database, so what matters is: a dry run
 * changes nothing, a file shared by a chat message and a gallery photo is
 * copied once and both rows follow it, and one bad file does not stop the rest.
 *
 * No database, no Cloudinary, no R2: models, download and upload are replaced.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const Photo = require('../src/models/Photo');
const Message = require('../src/models/Message');
const { run, describe, CLOUDINARY } = require('../scripts/migrate-files-to-r2');

const GROUP = '65a000000000000000000001';
const SHARED = 'https://res.cloudinary.com/splix/image/upload/v1/splix/groups/g/chat/abc.jpg';
const GALLERY = 'https://res.cloudinary.com/splix/image/upload/v1/splix/groups/g/def.jpg';
const VOICE = 'https://res.cloudinary.com/splix/video/upload/v1/splix/groups/g/chat/note_x1.m4a';
const DOC = 'https://res.cloudinary.com/splix/raw/upload/v1/splix/groups/g/chat/Trip_plan_q9.pdf';

const rows = (list) => ({ select: () => ({ lean: async () => list }) });

const world = (t, { photos, messages }) => {
  const photoFind = t.mock.method(Photo, 'find', () => rows(photos));
  const messageFind = t.mock.method(Message, 'find', () => rows(messages));
  const photoUpdates = t.mock.method(Photo, 'updateMany', async () => ({}));
  const messageUpdates = t.mock.method(Message, 'updateMany', async () => ({}));
  return { photoFind, messageFind, photoUpdates, messageUpdates };
};

const EVERYTHING = {
  photos: [
    { imageUrl: SHARED, group: GROUP },
    { imageUrl: GALLERY, group: GROUP },
  ],
  messages: [
    { group: GROUP, attachment: { url: SHARED, name: 'IMG_20.HEIC', mimeType: 'image/heic' } },
    { group: GROUP, attachment: { url: VOICE, name: 'voice.m4a', mimeType: 'audio/m4a' } },
    { group: GROUP, attachment: { url: DOC, name: 'Trip plan.pdf', mimeType: 'application/pdf' } },
  ],
};

const downloads = (types = {}) => async (url) => ({
  buffer: Buffer.from(`bytes of ${url}`),
  contentType: types[url] ?? (url.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'),
});

// Stands in for r2.upload: remembers what it was given and hands back an R2 address.
const fakeStore = () => {
  const given = [];
  const store = async (file, { folder }) => {
    given.push({ ...file, folder });
    const key = `${folder}/r2-${given.length}-${file.originalname}`;
    return { key, url: `https://srv1.example/media/${key}`, thumbUrl: `https://srv1.example/media/${key}.thumb.jpg` };
  };
  return { given, store };
};

const quiet = () => {};

test('only Cloudinary addresses are picked up', async (t) => {
  const { photoFind, messageFind } = world(t, { photos: [], messages: [] });
  await run({ log: quiet });
  assert.deepEqual(photoFind.mock.calls[0].arguments[0], { imageUrl: CLOUDINARY });
  assert.deepEqual(messageFind.mock.calls[0].arguments[0], { 'attachment.url': CLOUDINARY });
  assert.ok(CLOUDINARY.test(SHARED));
  assert.ok(!CLOUDINARY.test('https://srv1.example/media/splix/groups/g/a.jpg'));
  assert.ok(!CLOUDINARY.test('/uploads/a.jpg'));
});

test('a dry run counts and changes nothing', async (t) => {
  const { photoUpdates, messageUpdates } = world(t, EVERYTHING);
  const { given, store } = fakeStore();
  const said = [];

  const result = await run({ log: (line) => said.push(line), get: downloads(), store });

  assert.deepEqual(result, { total: 4, moved: 0, failed: [] });
  assert.equal(given.length, 0);
  assert.equal(photoUpdates.mock.callCount() + messageUpdates.mock.callCount(), 0);
  assert.match(said[0], /2 gallery photo\(s\) and 3 chat file\(s\), 4 file\(s\) in all/);
});

test('a chat photo that is also in the gallery is copied once, and both rows follow it', async (t) => {
  const { photoUpdates, messageUpdates } = world(t, EVERYTHING);
  const { given, store } = fakeStore();

  const result = await run({ apply: true, log: quiet, get: downloads(), store });

  assert.deepEqual(result, { total: 4, moved: 4, failed: [] });
  assert.equal(given.length, 4);

  const copy = given.find((file) => file.originalname === 'abc.jpg');
  assert.equal(copy.folder, `splix/groups/${GROUP}/chat`);
  const key = `splix/groups/${GROUP}/chat/r2-${given.indexOf(copy) + 1}-abc.jpg`;

  const photoCall = photoUpdates.mock.calls.find((call) => call.arguments[0].imageUrl === SHARED);
  assert.deepEqual(photoCall.arguments[1], {
    $set: {
      imageUrl: `https://srv1.example/media/${key}`,
      thumbUrl: `https://srv1.example/media/${key}.thumb.jpg`,
      storageProvider: 'r2',
      storageKey: key,
    },
  });
  const messageCall = messageUpdates.mock.calls.find((call) => call.arguments[0]['attachment.url'] === SHARED);
  assert.deepEqual(messageCall.arguments[1], {
    $set: {
      'attachment.url': `https://srv1.example/media/${key}`,
      'attachment.thumbUrl': `https://srv1.example/media/${key}.thumb.jpg`,
      'attachment.storageProvider': 'r2',
      'attachment.storageKey': key,
    },
  });

  // A gallery-only photo lands in the gallery folder.
  assert.equal(given.find((file) => file.originalname === 'def.jpg').folder, `splix/groups/${GROUP}`);
});

test('photos keep the type Cloudinary turned them into; documents keep the name they were sent with', () => {
  // The phone sent HEIC, Cloudinary stored a JPG: the copy must say JPG.
  assert.deepEqual(describe({ url: SHARED, name: 'IMG_20.HEIC', mimeType: 'image/heic' }, 'image/jpeg'), {
    mimetype: 'image/jpeg',
    originalname: 'abc.jpg',
  });
  assert.deepEqual(describe({ url: DOC, name: 'Trip plan.pdf', mimeType: 'application/pdf' }, 'application/octet-stream'), {
    mimetype: 'application/pdf',
    originalname: 'Trip plan.pdf',
  });
  assert.deepEqual(describe({ url: VOICE, name: 'voice.m4a', mimeType: 'audio/m4a' }, 'audio/mp4'), {
    mimetype: 'audio/mp4',
    originalname: 'voice.m4a',
  });
});

test('a file that cannot be fetched is reported and the rest still move', async (t) => {
  const { photoUpdates, messageUpdates } = world(t, EVERYTHING);
  const { given, store } = fakeStore();
  const get = async (url) => {
    if (url === VOICE) throw new Error('Cloudinary answered 404');
    return downloads()(url);
  };

  const result = await run({ apply: true, log: quiet, get, store });

  assert.equal(result.moved, 3);
  assert.deepEqual(result.failed, [{ url: VOICE, reason: 'Cloudinary answered 404' }]);
  assert.equal(given.length, 3);
  // The voice note's row is untouched, so a second run picks it up again.
  const touched = messageUpdates.mock.calls.map((call) => call.arguments[0]['attachment.url']);
  assert.ok(!touched.includes(VOICE));
  assert.ok(photoUpdates.mock.callCount() > 0);
});
