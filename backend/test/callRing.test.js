require('../testkit/safeEnv');

/**
 * Who a group call rings, and what their phones are told, with nothing sent.
 *
 * Three things here are easy to get wrong and are only noticed by the people
 * they happen to: the caller's own phone ringing, a muted group ringing, and
 * one call ringing twice because two people pressed the button together.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const Group = require('../src/models/Group');
const User = require('../src/models/User');
const pushService = require('../src/services/push.service');
const realtime = require('../src/realtime/socket');
const groupService = require('../src/services/group.service');
const messageService = require('../src/services/message.service');
const callRing = require('../src/services/callRing.service');
const controller = require('../src/controllers/stream.controller');

const ASHA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CARA = 'cccccccccccccccccccccccc';
const NOW = 1_800_000_000_000;

// Every test gets its own group: the "same call" memory is kept per group.
const trip = (fields = {}) =>
  new Group({ name: 'Tokyo Trip', createdBy: ASHA, members: [ASHA, BEN, CARA], ...fields });
const asha = () => new User({ _id: ASHA, name: 'Asha', email: 'asha@example.test' });

// Records what would have gone to phones and sockets.
const stubDelivery = (t) => {
  const sent = { pushes: [], events: [] };
  t.mock.method(pushService, 'sendToUsers', async (userIds, message, options = {}) => {
    sent.pushes.push({ to: userIds.map(String), message, options });
  });
  t.mock.method(realtime, 'emitToUser', (userId, event, payload) => {
    sent.events.push({ to: String(userId), event, payload });
  });
  return sent;
};

test('a call rings everyone in the group except the person who started it', async (t) => {
  const sent = stubDelivery(t);
  const group = trip();

  await callRing.ring({ group, caller: asha(), video: true, now: NOW });

  const data = {
    type: 'call',
    action: 'ring',
    groupId: String(group._id),
    groupName: 'Tokyo Trip',
    callerId: ASHA,
    callerName: 'Asha',
    video: true,
    at: NOW,
  };
  assert.deepEqual(sent.pushes, [
    {
      to: [BEN, CARA],
      // A title and a body: an iPhone, or a build from before calls rang, shows this as it is.
      message: { title: 'Tokyo Trip', body: 'Asha started a group video call', data },
      // Not worth delivering once the phone would have stopped ringing.
      options: { ttl: callRing.RING_SECONDS },
    },
  ]);
  assert.deepEqual(sent.events, [
    { to: BEN, event: 'call:ring', payload: data },
    { to: CARA, event: 'call:ring', payload: data },
  ]);
});

test('a muted group does not ring', async (t) => {
  const sent = stubDelivery(t);
  await callRing.ring({ group: trip({ mutedBy: [CARA] }), caller: asha(), video: false, now: NOW });

  assert.deepEqual(sent.pushes[0].to, [BEN]);
  assert.equal(sent.pushes[0].message.body, 'Asha started a group voice call');
  assert.deepEqual(sent.events.map((e) => e.to), [BEN]);
});

test('an app from before calls rang does not say what kind of call it is', async (t) => {
  const sent = stubDelivery(t);
  await callRing.ring({ group: trip(), caller: asha(), now: NOW });

  assert.equal(sent.pushes[0].message.data.video, null);
  assert.equal(sent.pushes[0].message.body, 'Asha started a group call');
});

test('two people starting the same call ring the others once', async (t) => {
  const sent = stubDelivery(t);
  const group = trip();

  assert.ok(await callRing.ring({ group, caller: asha(), video: true, now: NOW }));
  assert.equal(await callRing.ring({ group, caller: asha(), video: true, now: NOW + 2000 }), null);
  assert.equal(sent.pushes.length, 1);

  // Long enough after, it is another call.
  assert.ok(await callRing.ring({ group, caller: asha(), video: true, now: NOW + callRing.SAME_CALL_MS }));
  assert.equal(sent.pushes.length, 2);
});

test('a call that has ended can be started again straight away', async (t) => {
  const sent = stubDelivery(t);
  const group = trip();

  await callRing.ring({ group, caller: asha(), video: true, now: NOW });
  await callRing.end({ group, by: asha(), now: NOW + 3000 });
  assert.ok(await callRing.ring({ group, caller: asha(), video: true, now: NOW + 4000 }));

  assert.deepEqual(sent.pushes.map((p) => p.message.data.action), ['ring', 'end', 'ring']);
});

test('the end of a call is told to every other member, silently', async (t) => {
  const sent = stubDelivery(t);
  // Cara muted the group, but may have been rung before she did.
  const group = trip({ mutedBy: [CARA] });

  await callRing.end({ group, by: asha(), now: NOW });

  const data = { type: 'call', action: 'end', groupId: String(group._id), at: NOW };
  assert.deepEqual(sent.pushes, [
    { to: [BEN, CARA], message: { data }, options: { silent: true, ttl: callRing.RING_SECONDS } },
  ]);
  assert.deepEqual(sent.events.map((e) => [e.to, e.event]), [
    [BEN, 'call:end'],
    [CARA, 'call:end'],
  ]);
});

test('a ring that cannot be sent does not fail the call', async (t) => {
  t.mock.method(realtime, 'emitToUser', () => {
    throw new Error('socket down');
  });
  t.mock.method(console, 'error', () => {});

  assert.equal(await callRing.ring({ group: trip(), caller: asha(), video: true, now: NOW }), null);
  assert.equal(await callRing.end({ group: trip(), by: asha(), now: NOW }), null);
});

// ---- POST /stream/call-event ------------------------------------------------

// Runs the handler the way Express would, and resolves to what it answered.
const post = (body) =>
  new Promise((resolve, reject) => {
    const res = { json: (answer) => resolve(answer) };
    controller.callEvent({ body, user: asha() }, res, reject);
  });

const stubCallEvent = (t, group) => {
  const calls = { messages: [], rings: [], ends: [] };
  t.mock.method(groupService, 'getGroupForMember', async () => group);
  t.mock.method(messageService, 'postSystem', async (groupId, text) => {
    calls.messages.push(text);
    return { _id: 'message', text };
  });
  t.mock.method(callRing, 'ring', async (args) => {
    calls.rings.push(args);
  });
  t.mock.method(callRing, 'end', async (args) => {
    calls.ends.push(args);
  });
  return calls;
};

test('"started" posts the chat card and rings the group', async (t) => {
  const group = trip();
  const calls = stubCallEvent(t, group);

  const answer = await post({ groupId: String(group._id), event: 'started', video: false });

  assert.equal(answer.success, true);
  assert.deepEqual(calls.messages, ['Asha started a call']);
  assert.equal(calls.rings.length, 1);
  assert.equal(calls.rings[0].group, group);
  assert.equal(String(calls.rings[0].caller._id), ASHA);
  assert.equal(calls.rings[0].video, false);
  assert.deepEqual(calls.ends, []);
});

test('"ended" posts the chat card and stops the ringing', async (t) => {
  const group = trip();
  const calls = stubCallEvent(t, group);

  await post({ groupId: String(group._id), event: 'ended' });

  assert.deepEqual(calls.messages, ['Call ended']);
  assert.deepEqual(calls.rings, []);
  assert.equal(calls.ends.length, 1);
  assert.equal(String(calls.ends[0].by._id), ASHA);
});

test('someone who is not in the group rings nobody', async (t) => {
  const calls = stubCallEvent(t, trip());
  groupService.getGroupForMember.mock.mockImplementation(async () => {
    throw new Error('You are not a member of this group');
  });

  await assert.rejects(post({ groupId: ASHA, event: 'started', video: true }), /not a member/);
  assert.deepEqual(calls.messages, []);
  assert.deepEqual(calls.rings, []);
});
