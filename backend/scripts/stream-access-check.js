/**
 * Checks, against a Stream TEST app, that a group's call can be joined only by
 * its members: the part of call access (docs/STREAM-CALL-ACCESS.md) that only
 * Stream itself can answer. Run it after locking the test app's `default` call
 * type, and before locking production.
 *
 *   $env:STREAM_TEST_API_KEY='<test app key>'
 *   $env:STREAM_TEST_API_SECRET='<test app secret>'
 *   node scripts/stream-access-check.js
 *
 * It reads only those two variables: never backend/.env (which holds the
 * production keys) and nothing under src/, so it cannot reach the database or
 * production Stream by mistake. It refuses to run with the key that is in
 * backend/.env.
 *
 * What it does in the test app: reads the `default` call type's grants;
 * creates three users (splix-check-*); creates one call the way the server
 * does (members = two of them, as call_member); then, as each user with their
 * own token, tries to read, join and list that call, and to create a call of
 * their own. Prints PASS/FAIL for each, then deletes the calls it made.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { StreamClient } = require('@stream-io/node-sdk');

const API = 'https://video.stream-io-api.com/video';
const CALL_TYPE = 'default';

const fail = (message) => {
  console.error(`stream-access-check: ${message}`);
  process.exit(2);
};

const key = process.env.STREAM_TEST_API_KEY;
const secret = process.env.STREAM_TEST_API_SECRET;
if (!key || !secret) fail('set STREAM_TEST_API_KEY and STREAM_TEST_API_SECRET to a Stream TEST app.');

// The production key, if backend/.env has one: compared, never printed.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*STREAM_API_KEY\s*=/.test(l));
  const prodKey = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (prodKey && prodKey === key) fail('that is the key in backend/.env. Use a separate test app.');
}

const server = new StreamClient(key, secret);
const tokenFor = (userId) =>
  server.generateUserToken({ user_id: userId, iat: Math.floor(Date.now() / 1000) - 60, validity_in_seconds: 3600 });

// A request as that user, the way the app's Stream SDK makes it.
const asUser = async (userId, method, route, body) => {
  const res = await fetch(`${API}${route}?api_key=${encodeURIComponent(key)}`, {
    method,
    headers: {
      Authorization: tokenFor(userId),
      'stream-auth-type': 'jwt',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json };
};

const results = [];
const check = (name, ok, got) => results.push({ name, ok, got });
const allowed = (status) => status >= 200 && status < 300;

const PERMS_FOR_MEMBERS = ['join-call', 'read-call', 'send-audio', 'send-video'];
const PERMS_NOBODY_ELSE = ['create-call', 'join-call', 'read-call', 'join-ended-call'];
// "join-call", "JoinCall" and "join_call" are the same permission.
const norm = (permission) => String(permission).toLowerCase().replace(/[^a-z]/g, '');
const has = (list, permission) => (list ?? []).some((p) => norm(p) === norm(permission));

const main = async () => {
  // 1. The call type, as configured in the dashboard.
  const type = await server.video.getCallType({ name: CALL_TYPE });
  const grants = type.grants ?? {};
  console.log(`Grants on the "${CALL_TYPE}" call type:`);
  for (const role of Object.keys(grants).sort()) console.log(`  ${role}: ${(grants[role] ?? []).join(', ') || '(none)'}`);
  for (const role of ['user', 'guest', 'anonymous']) {
    const extra = PERMS_NOBODY_ELSE.filter((p) => has(grants[role], p));
    check(`role "${role}" cannot create, read or join calls`, extra.length === 0, extra.join(', ') || 'none');
  }
  const missing = PERMS_FOR_MEMBERS.filter((p) => !has(grants.call_member, p));
  check('role "call_member" can read, join, talk and show video', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : 'all there');

  // 2. Three people and one group call, set up the way the server does it.
  const run = crypto.randomBytes(3).toString('hex');
  const asha = `splix-check-asha-${run}`;
  const ben = `splix-check-ben-${run}`;
  const xavi = `splix-check-outsider-${run}`;
  await server.upsertUsers([
    { id: asha, name: 'Check Asha' },
    { id: ben, name: 'Check Ben' },
    { id: xavi, name: 'Check Outsider' },
  ]);
  const callId = crypto.randomBytes(12).toString('hex');
  const ownId = crypto.randomBytes(12).toString('hex');
  const call = server.video.call(CALL_TYPE, callId);
  await call.getOrCreate({
    data: {
      created_by_id: asha,
      members: [asha, ben].map((userId) => ({ user_id: userId, role: 'call_member' })),
    },
  });
  console.log(`\nTest call ${CALL_TYPE}:${callId}; members ${asha}, ${ben}; outsider ${xavi}\n`);

  try {
    const route = `/call/${CALL_TYPE}/${callId}`;
    const join = { create: false, location: 'IAD' };
    const listed = async (userId) => {
      const r = await asUser(userId, 'POST', '/calls', { filter_conditions: { id: callId }, limit: 10 });
      return { status: r.status, count: r.body?.calls?.length ?? 0 };
    };

    // 3. Members.
    for (const member of [asha, ben]) {
      const read = await asUser(member, 'GET', route);
      check(`member ${member} can read the call`, allowed(read.status), read.status);
      const joined = await asUser(member, 'POST', `${route}/join`, join);
      check(`member ${member} can join the call`, allowed(joined.status), joined.status);
    }
    const memberList = await listed(ben);
    check('a member sees the call when listing calls', memberList.count === 1, `${memberList.status}, ${memberList.count} found`);

    // 4. The outsider: everything refused, nothing listed.
    const read = await asUser(xavi, 'GET', route);
    check('the outsider cannot read the call', read.status === 403, read.status);
    const joined = await asUser(xavi, 'POST', `${route}/join`, join);
    check('the outsider cannot join the call', joined.status === 403, joined.status);
    const joinCreate = await asUser(xavi, 'POST', `${route}/join`, { ...join, create: true });
    check('the outsider cannot join it with create: true either', joinCreate.status === 403, joinCreate.status);
    const addSelf = await asUser(xavi, 'POST', `${route}/members`, { update_members: [{ user_id: xavi, role: 'call_member' }] });
    check('the outsider cannot make themselves a member', addSelf.status === 403, addSelf.status);
    const outsiderList = await listed(xavi);
    check('the outsider does not see the call when listing calls', outsiderList.count === 0, `${outsiderList.status}, ${outsiderList.count} found`);

    // 5. Nobody but the server creates calls (no squatting on a group's id
    // before the group first calls).
    const own = await asUser(xavi, 'POST', `/call/${CALL_TYPE}/${ownId}`, { data: { members: [{ user_id: xavi }] } });
    check('a user cannot create a call', own.status === 403, own.status);
  } finally {
    await call.delete({ hard: true }).catch(() => {});
    await server.video.call(CALL_TYPE, ownId).delete({ hard: true }).catch(() => {});
  }

  console.log('');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.got})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => fail(err.message));
