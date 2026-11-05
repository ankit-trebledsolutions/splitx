require('../testkit/safeEnv');

/**
 * What is handed to Expo's push service, with nothing actually sent.
 *
 * Two things here are easy to break and invisible when broken: a "silent" push
 * that carries a title is shown in the tray instead of reaching the app's
 * background task (so nobody's alarm gets set), and the marks that say "this
 * person's phone rings by itself" have to go when that phone does (or the
 * backup push at reminder time is held back for someone who has no alarm).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const User = require('../src/models/User');
const Reminder = require('../src/models/Reminder');
const pushService = require('../src/services/push.service');

const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = 'ExponentPushToken[asha-phone]';

// Stands in for Expo: records each request and answers "accepted".
const stubExpo = (t, users) => {
  const requests = [];
  t.mock.method(User, 'find', () => ({ select: () => ({ lean: async () => users }) }));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const messages = JSON.parse(options.body);
    requests.push({ url, messages, headers: options.headers });
    return { ok: true, json: async () => ({ data: messages.map((_m, i) => ({ status: 'ok', id: `ticket-${i}` })) }) };
  });
  return requests;
};

test('a visible push carries its words, sound and channel', async (t) => {
  const requests = stubExpo(t, [{ pushTokens: [TOKEN] }]);

  await pushService.sendToUsers([ASHA], { title: 'Reminder Set', body: 'Ben set a reminder', data: { type: 'reminder' } });

  assert.deepEqual(requests[0].messages, [
    {
      to: TOKEN,
      title: 'Reminder Set',
      body: 'Ben set a reminder',
      data: { type: 'reminder' },
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    },
  ]);
});

test('a silent push carries only data, so the phone gives it to the app instead of showing it', async (t) => {
  const requests = stubExpo(t, [{ pushTokens: [TOKEN] }]);

  await pushService.sendToUsers([ASHA], { data: { type: 'reminder-sync', action: 'refresh' } }, { silent: true });

  const [message] = requests[0].messages;
  assert.deepEqual(message.data, { type: 'reminder-sync', action: 'refresh' });
  assert.equal(message.priority, 'high');
  // Any of these would make it a notification the tray shows by itself.
  for (const field of ['title', 'body', 'sound', 'channelId']) {
    assert.equal(field in message, false, `a silent push must not carry "${field}"`);
  }
  // Both spellings of the flag that wakes an iOS app in the background.
  assert.equal(message.contentAvailable, true);
  assert.equal(message._contentAvailable, true);
});

test('a push that is only worth having now says how long it may be kept trying', async (t) => {
  const requests = stubExpo(t, [{ pushTokens: [TOKEN] }]);

  await pushService.sendToUsers([ASHA], { title: 'Tokyo Trip', body: 'Ben started a group call' }, { ttl: 45 });
  await pushService.sendToUsers([ASHA], { data: { type: 'call', action: 'end' } }, { silent: true, ttl: 45 });
  await pushService.sendToUsers([ASHA], { title: 'Reminder Set', body: 'Ben set a reminder' });

  assert.equal(requests[0].messages[0].ttl, 45);
  assert.equal(requests[1].messages[0].ttl, 45);
  // Everything else is left to the push services' own, much longer, limit.
  assert.equal('ttl' in requests[2].messages[0], false);
});

// Sets EXPO_ACCESS_TOKEN as env.js would have read it, for this test only.
const withAccessToken = (t, token) => {
  const before = env.expoAccessToken;
  env.expoAccessToken = token;
  t.after(() => {
    env.expoAccessToken = before;
  });
};

test('with no Expo access token set, pushes go out as they always have', async (t) => {
  withAccessToken(t, '');
  const requests = stubExpo(t, [{ pushTokens: [TOKEN] }]);

  await pushService.sendToUsers([ASHA], { title: 'Tokyo Trip', body: 'Ben started a group call' });

  assert.deepEqual(requests[0].headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
});

test('with an Expo access token set, every request to Expo carries it, receipt checks included', async (t) => {
  // With push security on, Expo refuses a request without it: a leaked push
  // token alone can no longer make a phone ring.
  withAccessToken(t, 'expo-access-token');
  t.mock.method(User, 'find', () => ({ select: () => ({ lean: async () => [{ pushTokens: [TOKEN] }] }) }));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, headers: options.headers });
    const answer = url.endsWith('/getReceipts') ? {} : [{ status: 'ok', id: 'ticket-0' }];
    return { ok: true, json: async () => ({ data: answer }) };
  });
  // The receipt check runs a minute after sending.
  t.mock.timers.enable({ apis: ['setTimeout'] });

  await pushService.sendToUsers([ASHA], { title: 'Tokyo Trip', body: 'Ben started a group call' });
  t.mock.timers.tick(60 * 1000);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    requests.map(({ url }) => url.split('/').pop()),
    ['send', 'getReceipts']
  );
  for (const { headers } of requests) {
    assert.equal(headers.Authorization, 'Bearer expo-access-token');
    assert.equal(headers['Content-Type'], 'application/json');
  }
});

test('nothing is sent when nobody has a phone registered', async (t) => {
  const requests = stubExpo(t, []);
  await pushService.sendToUsers([ASHA], { title: 'x', body: 'y' });
  await pushService.sendToUsers([], { title: 'x', body: 'y' });
  assert.deepEqual(requests, []);
});

// Records the writes registerToken / removeToken make, answering "known" as told.
const stubTokenStore = (t, { known, previousOwners = [] }) => {
  const cleared = [];
  t.mock.method(User, 'exists', async () => (known ? { _id: ASHA } : null));
  t.mock.method(User, 'find', () => ({ distinct: async () => previousOwners }));
  t.mock.method(User, 'updateMany', async () => {});
  t.mock.method(User, 'updateOne', async () => {});
  t.mock.method(Reminder, 'updateMany', async (filter, update) => {
    cleared.push({ filter, update });
  });
  return cleared;
};

test('a new phone (or a reinstall) starts with no alarms confirmed', async (t) => {
  const cleared = stubTokenStore(t, { known: false });
  await pushService.registerToken(ASHA, TOKEN);
  assert.deepEqual(cleared, [
    { filter: { armedBy: { $in: [ASHA] } }, update: { $pull: { armedBy: { $in: [ASHA] } } } },
  ]);
});

test('the same phone registering again keeps its confirmations', async (t) => {
  // This happens on every app start; clearing here would bring the backup push
  // back for someone whose alarms are all set.
  const cleared = stubTokenStore(t, { known: true });
  await pushService.registerToken(ASHA, TOKEN);
  assert.deepEqual(cleared, []);
});

test('whoever had the phone before loses their confirmations when someone else signs in on it', async (t) => {
  const cleared = stubTokenStore(t, { known: false, previousOwners: [BEN] });
  await pushService.registerToken(ASHA, TOKEN);
  assert.deepEqual(cleared[0].filter, { armedBy: { $in: [BEN, ASHA] } });
});

test('signing out clears the confirmations: that phone no longer holds the alarms', async (t) => {
  const cleared = stubTokenStore(t, { known: true });
  await pushService.removeToken(ASHA, TOKEN);
  assert.deepEqual(cleared[0].filter, { armedBy: { $in: [ASHA] } });
});
