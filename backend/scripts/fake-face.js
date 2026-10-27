/**
 * A stand-in for the face service (face-service/app.py), for tests and for
 * trying Face Scan in the app without Python or the models. Loads nothing from
 * src/ and no .env: it is only an HTTP server on 127.0.0.1.
 *
 *   node scripts/fake-face.js --port 4020
 *
 * Point a LOCAL backend at it:
 *
 *   FACE_SERVICE_URL=http://127.0.0.1:4020
 *
 * It cannot see faces, so what it answers comes from the upload itself:
 *
 *   - a file whose content is JSON `{ "faces": [ { "box", "score", "embedding" } ] }`
 *     is answered with exactly those faces. An embedding may be short: it is
 *     padded with zeros to 512 numbers and scaled to unit length, so tests can
 *     write `[1, 0]` and `[0, 1]` for two different people. `"faces": []` is
 *     a picture with nobody in it.
 *   - any other file is answered with one face whose embedding is made from a
 *     hash of the bytes: the same file always gives the same person, two
 *     different files never match. Enough to click through the app.
 *
 * In tests: const fake = await require('../scripts/fake-face').start();
 * then fake.url, fake.requests, fake.lastRequest() and await fake.close().
 */
const crypto = require('crypto');
const http = require('http');

const EMBEDDING_SIZE = 512;

const normalise = (values) => {
  const vector = new Array(EMBEDDING_SIZE).fill(0);
  values.slice(0, EMBEDDING_SIZE).forEach((v, i) => {
    vector[i] = Number(v) || 0;
  });
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
};

// A unit vector that depends only on the bytes.
const vectorFromBytes = (bytes) => {
  const values = [];
  let seed = crypto.createHash('sha256').update(bytes).digest();
  while (values.length < EMBEDDING_SIZE) {
    for (let i = 0; i + 1 < seed.length && values.length < EMBEDDING_SIZE; i += 2) {
      values.push(seed.readInt16LE(i) / 32768);
    }
    seed = crypto.createHash('sha256').update(seed).digest();
  }
  return normalise(values);
};

const answerFor = (bytes) => {
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (parsed && Array.isArray(parsed.faces)) {
      return {
        model: 'fake',
        dim: EMBEDDING_SIZE,
        width: parsed.width ?? 1000,
        height: parsed.height ?? 800,
        faces: parsed.faces.map((face, i) => ({
          box: face.box ?? [0.1 * i, 0.1, 0.1 * i + 0.3, 0.6],
          score: face.score ?? 0.95,
          embedding: normalise(face.embedding ?? [1]),
        })),
      };
    }
  } catch {
    // Not JSON: a real file, answered from its hash.
  }
  return {
    model: 'fake',
    dim: EMBEDDING_SIZE,
    width: 1000,
    height: 800,
    faces: [{ box: [0.3, 0.2, 0.7, 0.8], score: 0.98, embedding: vectorFromBytes(bytes) }],
  };
};

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

// The uploaded `file` field out of a multipart body, with no dependency: the
// request is read as a web Response, whose formData() understands multipart.
const uploadedFile = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const form = await new Response(body, { headers: { 'content-type': req.headers['content-type'] } }).formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return null;
  return Buffer.from(await file.arrayBuffer());
};

const start = async ({ port = 0 } = {}) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { status: 'ok', model: 'fake', dim: EMBEDDING_SIZE });
      return;
    }
    if (req.method !== 'POST' || url.pathname !== '/faces') {
      json(res, 404, { detail: 'not found' });
      return;
    }
    try {
      const bytes = await uploadedFile(req);
      requests.push({
        det: Number(url.searchParams.get('det')),
        limit: Number(url.searchParams.get('limit')),
        bytes: bytes?.length ?? 0,
      });
      if (!bytes || !bytes.length) {
        json(res, 400, { detail: 'empty upload' });
        return;
      }
      // What the real service says to a file it cannot read.
      if (bytes.toString('utf8', 0, 12) === 'not-an-image') {
        json(res, 415, { detail: 'not an image this service can read' });
        return;
      }
      json(res, 200, answerFor(bytes));
    } catch (err) {
      json(res, 500, { detail: err.message });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    lastRequest: () => requests[requests.length - 1],
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

module.exports = { start, normalise, vectorFromBytes, EMBEDDING_SIZE };

if (require.main === module) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag === -1 ? 4020 : Number(process.argv[portFlag + 1]);
  start({ port }).then((fake) => console.log(`fake face service on ${fake.url}`));
}
