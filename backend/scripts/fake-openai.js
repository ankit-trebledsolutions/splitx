/**
 * A stand-in for OpenAI's Responses API, for tests and for trying the AI
 * planner in the app without a key or a bill. Loads nothing from src/ and no
 * .env: it is only an HTTP server on 127.0.0.1.
 *
 *   node scripts/fake-openai.js --port 4010 [--slow-ms 20000]
 *
 * Point a LOCAL backend at it (never production, which ignores OPENAI_BASE_URL):
 *
 *   OPENAI_BASE_URL=http://127.0.0.1:4010/v1
 *   OPENAI_API_KEY=fake-ok
 *
 * The "key" picks what the server plays back:
 *
 *   fake-ok             a plan with as many days as the request asked for
 *   fake-slow           the same plan, after --slow-ms (shows the working
 *                       animation; past OPENAI_TIMEOUT_MS it is a timeout)
 *   fake-16days         16 days whatever was asked (the server must cut it)
 *   fake-nodays         days: [] - "this is not a real place"
 *   fake-garbage        a 200 whose text is not JSON
 *   fake-refusal        a 200 carrying a refusal
 *   fake-truncated      a 200 cut off at max_output_tokens
 *   fake-filtered       a 200 stopped by the content filter
 *   fake-401            invalid key
 *   fake-403            no access from this region
 *   fake-modelnotfound  the main model does not exist, the fallback does
 *   fake-modelnotfound-403  the same, answered as a 403 (a project without access to the model)
 *   fake-nomodel        no model exists at all
 *   fake-quota          429, out of credit (do not retry)
 *   fake-rate           429, rate limited (retry after 1 s)
 *   fake-500            server error (retry at once)
 *   fake-flaky          server error on the first request, the plan on the retry
 *
 * In tests: const fake = await require('./fake-openai').start();
 * then fake.url, fake.requests, fake.lastRequest() and await fake.close().
 */
const http = require('http');

const DEFAULT_SLOW_MS = 20000;
// The only model the two "model not found" scenarios differ on: env.js's default fallback.
const DEFAULT_FALLBACK_MODEL = 'gpt-5.4-mini';

const ACTIVITIES = [
  { time: '9:00 AM', endTime: '11:00 AM', title: 'Old town walk', location: 'Clock Tower, Old Town', icon: 'walk-outline', note: 'Start early to avoid the heat.' },
  { time: '11:30 AM', endTime: '1:00 PM', title: 'City museum', location: 'City Museum, Centre', icon: 'library-outline', note: 'Check opening hours.' },
  { time: '1:15 PM', endTime: '2:15 PM', title: 'Lunch on the food street', location: 'Market Road, Centre', icon: 'restaurant-outline', note: '' },
  { time: '5:30 PM', endTime: '', title: 'Sunset viewpoint', location: 'Hill Fort, North side', icon: 'camera-outline', note: 'About ~200 per person by cab.' },
];

const planFor = (dayCount) => ({
  days: Array.from({ length: dayCount }, (_, i) => ({
    dayNumber: i + 1,
    title: `Highlights ${i + 1}`,
    activities: ACTIVITIES,
  })),
});

const USAGE = {
  input_tokens: 900,
  output_tokens: 3200,
  output_tokens_details: { reasoning_tokens: 600 },
  total_tokens: 4100,
};

// Shaped like the real thing: a reasoning item comes before the message.
const completed = (model, content) => ({
  id: 'resp_fake',
  object: 'response',
  status: 'completed',
  model,
  output: [
    { id: 'rs_fake', type: 'reasoning', summary: [] },
    { id: 'msg_fake', type: 'message', role: 'assistant', status: 'completed', content },
  ],
  usage: USAGE,
});

const textAnswer = (model, text) => completed(model, [{ type: 'output_text', text, annotations: [] }]);

const apiError = (message, type, code) => ({ error: { message, type, param: null, code } });

const requestedDays = (body) => {
  try {
    return JSON.parse(body.input[0].content).days || 1;
  } catch {
    return 1;
  }
};

// scenario -> { status, json, headers?, delayMs? }. `attempt` counts the requests this scenario has had, from 1.
const play = (scenario, body, { slowMs, fallbackModel, attempt }) => {
  const plan = () => textAnswer(body.model, JSON.stringify(planFor(requestedDays(body))));
  const modelNotFound = {
    status: 404,
    json: apiError(`The model \`${body.model}\` does not exist or you do not have access to it.`, 'invalid_request_error', 'model_not_found'),
  };
  const incomplete = (reason) => ({
    status: 200,
    json: {
      ...completed(body.model, []),
      status: 'incomplete',
      incomplete_details: { reason },
      output: [{ id: 'rs_fake', type: 'reasoning', summary: [] }],
    },
  });
  const serverError = { status: 500, headers: { 'retry-after': '0' }, json: apiError('The server had an error.', 'server_error', null) };

  switch (scenario) {
    case 'fake-ok':
      return { status: 200, json: plan() };
    case 'fake-slow':
      return { status: 200, json: plan(), delayMs: slowMs };
    case 'fake-16days':
      return { status: 200, json: textAnswer(body.model, JSON.stringify(planFor(16))) };
    case 'fake-nodays':
      return { status: 200, json: textAnswer(body.model, JSON.stringify({ days: [] })) };
    case 'fake-garbage':
      return { status: 200, json: textAnswer(body.model, 'Sure! Here is your plan: {"days": [') };
    case 'fake-refusal':
      return { status: 200, json: completed(body.model, [{ type: 'refusal', refusal: 'I cannot help with that.' }]) };
    case 'fake-truncated':
      return incomplete('max_output_tokens');
    case 'fake-filtered':
      return incomplete('content_filter');
    case 'fake-401':
      return { status: 401, json: apiError('Incorrect API key provided.', 'invalid_request_error', 'invalid_api_key') };
    case 'fake-403':
      return { status: 403, json: apiError('Country, region, or territory not supported.', 'request_forbidden', 'unsupported_country_region_territory') };
    case 'fake-modelnotfound':
      return body.model === fallbackModel ? { status: 200, json: plan() } : modelNotFound;
    case 'fake-modelnotfound-403':
      return body.model === fallbackModel ? { status: 200, json: plan() } : { ...modelNotFound, status: 403 };
    case 'fake-nomodel':
      return modelNotFound;
    case 'fake-quota':
      return { status: 429, json: apiError('You exceeded your current quota.', 'insufficient_quota', 'insufficient_quota') };
    case 'fake-rate':
      return { status: 429, headers: { 'retry-after': '1' }, json: apiError('Rate limit reached.', 'rate_limit_error', 'rate_limit_exceeded') };
    case 'fake-500':
      return serverError;
    case 'fake-flaky':
      return attempt === 1 ? serverError : { status: 200, json: plan() };
    default:
      return { status: 401, json: apiError(`Unknown fake scenario "${scenario}".`, 'invalid_request_error', 'invalid_api_key') };
  }
};

const readJson = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (piece) => {
      raw += piece;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

const start = ({ port = 0, slowMs = DEFAULT_SLOW_MS, fallbackModel = DEFAULT_FALLBACK_MODEL } = {}) =>
  new Promise((resolve, reject) => {
    // Every request received, oldest first: { scenario, body }.
    const requests = [];

    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/responses') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(apiError(`Unknown request: ${req.method} ${req.url}`, 'invalid_request_error', null)));
        return;
      }
      const body = await readJson(req);
      const scenario = (req.headers.authorization || '').replace(/^Bearer /, '');
      requests.push({ scenario, body });
      const attempt = requests.filter((request) => request.scenario === scenario).length;

      const { status, json, headers = {}, delayMs = 0 } = play(scenario, body, { slowMs, fallbackModel, attempt });
      const timer = setTimeout(() => {
        res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': 'req_fake', ...headers });
        res.end(JSON.stringify(json));
      }, delayMs);
      // The caller gave up (its timeout): nothing left to answer.
      res.on('close', () => clearTimeout(timer));
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      resolve({
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}/v1`,
        requests,
        lastRequest: () => requests[requests.length - 1] ?? null,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });

module.exports = { start };

if (require.main === module) {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : parseInt(process.argv[index + 1], 10);
  };
  start({ port: option('--port', 4010), slowMs: option('--slow-ms', DEFAULT_SLOW_MS) })
    .then((fake) => console.log(`Fake OpenAI listening on ${fake.url} (OPENAI_API_KEY picks the scenario, e.g. fake-ok)`))
    .catch((err) => {
      console.error('Could not start the fake OpenAI server:', err.message);
      process.exit(1);
    });
}
