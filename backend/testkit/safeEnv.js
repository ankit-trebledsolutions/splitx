/**
 * Makes it impossible for a test or the smoke script to touch anything real.
 *
 * backend/.env points at the live database, live Cloudinary and real API keys,
 * and src/config/env.js loads it the moment anything under src/ is required.
 * So this file must be the FIRST statement of every test file and script that
 * runs backend code:
 *
 *   require('../testkit/safeEnv');
 *
 * What it does, in order:
 *  1. Moves the process out of backend/. dotenv only looks for .env in the
 *     current directory, so from the OS temp folder it finds none.
 *  2. Overwrites every variable that names an outside service with a local or
 *     blank value, including ones the shell may have exported (a real
 *     OPENAI_API_KEY, for instance).
 *  3. Exports assertSafe(env), to call right after requiring src/config/env:
 *     the last check before anything connects anywhere.
 *
 * Deliberately not loaded with `node --test --require`: a preload also runs in
 * the test runner's parent process, where the chdir would move test discovery
 * into the temp folder. It lives outside test/ because the runner executes
 * every file in there as a test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.chdir(os.tmpdir());
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  throw new Error(`safeEnv: ${process.cwd()} contains a .env file that dotenv would load. Remove it first.`);
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/splix_test',
  JWT_SECRET: 'test-only-secret',
  STREAM_API_KEY: 'test-stream-key',
  STREAM_API_SECRET: 'test-stream-secret',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  RESEND_API_KEY: '',
  // Not a key: the fake OpenAI server (scripts/fake-openai.js) reads it as the scenario to play.
  OPENAI_API_KEY: 'fake-ok',
  // Port 9 is "discard": nothing answers there. Tests point this at their own fake server.
  OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
  OPENAI_TIMEOUT_MS: '1500',
});

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

const isLocal = (uri) => {
  try {
    return LOCAL_HOSTS.has(new URL(uri).hostname);
  } catch {
    // A URI the parser rejects (several hosts, say) is not provably local.
    return false;
  }
};

const assertSafe = (env) => {
  if (env.nodeEnv !== 'test') {
    throw new Error(`safeEnv: NODE_ENV is "${env.nodeEnv}", expected "test"`);
  }
  if (!isLocal(env.mongoUri)) {
    throw new Error('safeEnv: MONGODB_URI does not point at this machine. Refusing to run.');
  }
  if (!isLocal(env.openai.baseUrl)) {
    throw new Error('safeEnv: OPENAI_BASE_URL does not point at this machine. Refusing to run.');
  }
};

module.exports = { assertSafe, isLocal };
