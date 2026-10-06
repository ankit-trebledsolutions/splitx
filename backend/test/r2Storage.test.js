require('../testkit/safeEnv');

/**
 * Files in Cloudflare R2, and GET /media, the address every one of them is
 * saved under.
 *
 * Nothing reaches Cloudflare: the S3 client is replaced by one that records
 * what it was asked to do. The thumbnails are made for real by sharp, since a
 * grid of sideways or missing squares is the failure that would matter.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const sharp = require('sharp');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const r2 = require('../src/storage/r2.storage');
const storage = require('../src/storage');
const store = require('../src/integrations/store');
const app = require('../src/app');

const FOLDER = 'splix/groups/65a000000000000000000001';

// A bucket of its own for every test: the storage keeps one client per set of
// keys, so a shared set would hand one test the previous test's fake.
const useBucket = (t, { mediaBaseUrl = 'https://srv1.example/media' } = {}) => {
  const before = { r2: env.r2, mediaBaseUrl: env.mediaBaseUrl };
  env.r2 = {
    accountId: crypto.randomBytes(16).toString('hex'),
    accessKeyId: 'k'.repeat(32),
    secretAccessKey: 's'.repeat(64),
    bucket: 'splitx-media',
  };
  env.mediaBaseUrl = mediaBaseUrl;
  store.apply([]);
  t.after(() => Object.assign(env, before));
  return env.r2;
};

// Records every command; `fail` decides which ones R2 turns down.
const fakeClient = (t, { fail = () => false } = {}) => {
  const sent = [];
  t.mock.method(r2.outside, 'client', () => ({
    send: async (command) => {
      sent.push({ type: command.constructor.name, input: command.input });
      if (fail(command)) throw new Error('R2 said no');
      return {};
    },
  }));
  return sent;
};

const photo = async (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: '#2a9d8f' } }).jpeg().toBuffer();

test('a photo is stored with a square next to it, under the address it will be fetched from', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);

  const stored = await r2.upload(
    { buffer: await photo(), mimetype: 'image/jpeg', originalname: 'Beach day.jpg' },
    { folder: FOLDER }
  );

  assert.match(stored.key, new RegExp(`^${FOLDER}/\\d+-[a-f0-9]{24}-Beach_day\\.jpg$`));
  assert.equal(stored.url, `https://srv1.example/media/${stored.key}`);
  assert.equal(stored.thumbUrl, `https://srv1.example/media/${stored.key}${r2.THUMB_SUFFIX}`);

  const [original, square] = sent;
  assert.deepEqual(
    sent.map((call) => [call.type, call.input.Bucket, call.input.Key]),
    [
      ['PutObjectCommand', 'splitx-media', stored.key],
      ['PutObjectCommand', 'splitx-media', `${stored.key}${r2.THUMB_SUFFIX}`],
    ]
  );
  assert.equal(original.input.ContentType, 'image/jpeg');
  assert.equal(original.input.CacheControl, 'public, max-age=31536000, immutable');
  assert.equal(original.input.ContentDisposition, 'inline; filename="Beach_day.jpg"');

  const made = await sharp(square.input.Body).metadata();
  assert.deepEqual([made.format, made.width, made.height], ['jpeg', 400, 400]);
});

test('a photo the phone marked as turned is squared the right way up', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);
  // Wide pixels, with EXIF saying "turn 90°": the picture people see is tall.
  // A square cut from the unturned pixels would show the scene on its side.
  const turned = await sharp({ create: { width: 900, height: 300, channels: 3, background: '#000' } })
    .composite([{ input: await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer(), left: 0, top: 0 }])
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  await r2.upload({ buffer: turned, mimetype: 'image/jpeg', originalname: 'turned.jpg' }, { folder: FOLDER });

  // After turning, the white block sits along the top of a tall picture, so the
  // top of the square is light and the bottom dark.
  const square = sharp(sent[1].input.Body);
  const { data } = await square.greyscale().raw().toBuffer({ resolveWithObject: true });
  const top = data[400 * 2 + 200];
  const bottom = data[400 * 397 + 200];
  assert.ok(top > 200 && bottom < 50, `top ${top}, bottom ${bottom}`);
});

test('a voice note or document is stored once, keeping its name', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);

  const stored = await r2.upload(
    { buffer: Buffer.from('%PDF-1.7'), mimetype: 'application/pdf', originalname: 'Trip plan (final).pdf' },
    { folder: `${FOLDER}/chat` }
  );

  assert.equal(sent.length, 1);
  assert.equal(stored.thumbUrl, stored.url);
  assert.equal(sent[0].input.ContentType, 'application/pdf');
  assert.equal(sent[0].input.ContentDisposition, 'inline; filename="Trip_plan__final_.pdf"');
});

test('a photo sharp cannot read is still stored, and the grid shows it whole', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);

  const stored = await r2.upload(
    { buffer: Buffer.from('not really a picture'), mimetype: 'image/heic', originalname: 'IMG_0001.HEIC' },
    { folder: FOLDER }
  );

  assert.equal(sent.length, 1);
  assert.equal(stored.thumbUrl, stored.url);
});

test('a file name cannot climb out of its folder or break the header', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);

  const stored = await r2.upload(
    { buffer: Buffer.from('x'), mimetype: 'text/plain', originalname: '../../other-group/"evil"\r\nX-Header: 1.txt' },
    { folder: FOLDER }
  );

  assert.equal(stored.key.split('/').length, FOLDER.split('/').length + 1);
  assert.ok(stored.key.startsWith(`${FOLDER}/`));
  assert.match(sent[0].input.ContentDisposition, /^inline; filename="[A-Za-z0-9._-]+"$/);
});

test('two uploads of the same file never share a key', async (t) => {
  useBucket(t);
  fakeClient(t);
  const file = { buffer: Buffer.from('x'), mimetype: 'text/plain', originalname: 'a.txt' };
  const [one, two] = await Promise.all([r2.upload(file, { folder: FOLDER }), r2.upload(file, { folder: FOLDER })]);
  assert.notEqual(one.key, two.key);
});

test('if R2 turns half of an upload down, neither half is left behind', async (t) => {
  useBucket(t);
  const sent = fakeClient(t, { fail: (command) => String(command.input.Key).endsWith(r2.THUMB_SUFFIX) });

  await assert.rejects(
    r2.upload({ buffer: await photo(), mimetype: 'image/jpeg', originalname: 'a.jpg' }, { folder: FOLDER }),
    /Upload failed/
  );

  const removed = sent.filter((call) => call.type === 'DeleteObjectCommand').map((call) => call.input.Key);
  const key = sent[0].input.Key;
  assert.deepEqual(removed.sort(), [key, `${key}${r2.THUMB_SUFFIX}`].sort());
});

test('removing a file removes its square too', async (t) => {
  useBucket(t);
  const sent = fakeClient(t);
  await r2.remove(`${FOLDER}/1-abc-a.jpg`);
  assert.deepEqual(
    sent.map((call) => [call.type, call.input.Key]),
    [
      ['DeleteObjectCommand', `${FOLDER}/1-abc-a.jpg`],
      ['DeleteObjectCommand', `${FOLDER}/1-abc-a.jpg${r2.THUMB_SUFFIX}`],
    ]
  );
});

test('without MEDIA_BASE_URL a file is addressed on whatever origin the app uses', async (t) => {
  useBucket(t, { mediaBaseUrl: '' });
  fakeClient(t);
  const stored = await r2.upload({ buffer: Buffer.from('x'), mimetype: 'text/plain', originalname: 'a.txt' }, { folder: FOLDER });
  assert.ok(stored.url.startsWith(`/media/${FOLDER}/`));
});

test('uploads go to R2 whenever it is set up, and say so', async (t) => {
  useBucket(t);
  fakeClient(t);
  const stored = await storage.upload({ buffer: Buffer.from('x'), mimetype: 'text/plain', originalname: 'a.txt' }, { folder: FOLDER });
  assert.equal(stored.provider, 'r2');
});

test('a file still marked as Cloudinary is left alone rather than failing the delete', async () => {
  await assert.doesNotReject(storage.remove('splix/groups/1/abc', 'cloudinary'));
});

// ---- GET /media -------------------------------------------------------------

const serve = async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  t.after(() => new Promise((done) => server.close(done)));
  return (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual' });
};

test('/media sends the app on to a short-lived link for exactly the file it asked for', async (t) => {
  useBucket(t);
  fakeClient(t);
  const signed = t.mock.method(r2.outside, 'sign', async () => 'https://bucket.example/signed?X-Amz-Signature=abc');
  const get = await serve(t);

  const res = await get(`/media/${FOLDER}/1-abc-Beach%20day.jpg`);

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://bucket.example/signed?X-Amz-Signature=abc');
  assert.equal(res.headers.get('cache-control'), 'private, max-age=600');
  const [, command, options] = signed.mock.calls[0].arguments;
  assert.deepEqual(command.input, { Bucket: 'splitx-media', Key: `${FOLDER}/1-abc-Beach day.jpg` });
  assert.deepEqual(options, { expiresIn: r2.SIGNED_URL_SECONDS });
});

test('the link really is signed for this bucket and runs out after an hour', async (t) => {
  const keys = useBucket(t);
  // A real client: making one, and signing with it, never leaves the machine.
  t.mock.method(r2.outside, 'client', r2.clientFor);

  const link = new URL(await r2.signedUrl(`${FOLDER}/1-abc-a.jpg`));

  assert.ok(link.hostname.endsWith(`${keys.accountId}.r2.cloudflarestorage.com`), link.hostname);
  assert.ok(link.pathname.endsWith(`/${FOLDER}/1-abc-a.jpg`), link.pathname);
  assert.equal(link.searchParams.get('X-Amz-Expires'), '3600');
  assert.ok(link.searchParams.get('X-Amz-Signature'));
  assert.ok(!link.href.includes(keys.secretAccessKey));
});

test('/media answers 404 when there is no bucket to ask', async (t) => {
  const before = env.r2;
  env.r2 = null;
  store.apply([]);
  t.after(() => {
    env.r2 = before;
  });
  const get = await serve(t);

  const res = await get(`/media/${FOLDER}/1-abc-a.jpg`);
  assert.equal(res.status, 404);
  assert.equal((await get('/media/')).status, 404);
});
