require('../testkit/safeEnv');

/**
 * backend/.env points at the live database, so a test that forgets safeEnv is
 * not a failing test, it is an incident. This file fails the whole run when any
 * test file does not start with it, and checks that safeEnv really isolates.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertSafe } = require('../testkit/safeEnv');

const FIRST_STATEMENT = "require('../testkit/safeEnv');";

test('every test file starts with the safeEnv require', () => {
  const files = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.js'));
  assert.ok(files.length > 1, 'the other test files were not found');
  for (const name of files) {
    const firstLine = fs.readFileSync(path.join(__dirname, name), 'utf8').split(/\r?\n/, 1)[0];
    assert.equal(firstLine, FIRST_STATEMENT, `${name} must begin with ${FIRST_STATEMENT}`);
  }
});

test('nothing but test files lives in test/, because the runner executes every .js in here', () => {
  const strays = fs.readdirSync(__dirname).filter((name) => !name.endsWith('.test.js'));
  assert.deepEqual(strays, []);
});

test('safeEnv moved the process to a folder with no .env and pinned local-only values', () => {
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(os.tmpdir()));
  assert.equal(fs.existsSync(path.join(process.cwd(), '.env')), false);

  const env = require('../src/config/env');
  assertSafe(env);
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.mongoUri, 'mongodb://127.0.0.1:27017/splix_test');
  assert.equal(env.cloudinary, null);
  assert.equal(env.email.resendApiKey, '');
  assert.equal(env.openai.apiKey, 'fake-ok');
  assert.equal(new URL(env.openai.baseUrl).hostname, '127.0.0.1');
});

test('assertSafe refuses anything that is not this machine', () => {
  const local = {
    nodeEnv: 'test',
    mongoUri: 'mongodb://127.0.0.1:27017/splix_test',
    openai: { baseUrl: 'http://localhost:4010/v1' },
  };
  assert.doesNotThrow(() => assertSafe(local));
  assert.throws(() => assertSafe({ ...local, nodeEnv: 'development' }), /NODE_ENV/);
  assert.throws(() => assertSafe({ ...local, mongoUri: 'mongodb+srv://cluster0.example.mongodb.net/splix' }), /MONGODB_URI/);
  assert.throws(() => assertSafe({ ...local, mongoUri: 'mongodb://127.0.0.1:27017,db.example.com:27017/splix' }), /MONGODB_URI/);
  assert.throws(() => assertSafe({ ...local, openai: { baseUrl: 'https://api.openai.com/v1' } }), /OPENAI_BASE_URL/);
});
