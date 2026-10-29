require('../testkit/safeEnv');

/**
 * The parts of the support service that decide things on their own: which
 * view of a report each side gets, how a notification is cut to length, what
 * the queue's filter looks like, and what account deletion takes with it.
 *
 * The routes are covered in support.routes.test.js and
 * adminSupport.routes.test.js; this is what sits under them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
require('../testkit/safeEnv').assertSafe(env);
const SupportReport = require('../src/models/SupportReport');
const storage = require('../src/storage');
const { present, shorten, buildQueueQuery, removeForUser } = require('../src/services/support.service');

const USER = '65a000000000000000000010';

const row = () => ({
  _id: '65b000000000000000000001',
  user: { _id: USER, name: 'Jane Doe', email: 'jane@example.com' },
  category: 'payment',
  subject: 'Charged twice',
  message: 'The settle button was pressed once and two entries appeared.',
  status: 'in_progress',
  priority: 'high',
  attachments: [
    { url: '/uploads/a.png', thumbUrl: '/uploads/a.png', storageKey: 'a.png', storageProvider: 'local' },
  ],
  events: [
    { kind: 'note', body: 'Duplicate POST from a double tap?', byName: 'Admin' },
    { kind: 'priority', priority: 'high', byName: 'Admin' },
    { kind: 'status', status: 'in_progress', byName: 'Admin' },
    { kind: 'reply', body: 'Looking into it now.', byName: 'Admin' },
  ],
});

test('the app is shown replies and status changes, never notes or priority', () => {
  const shown = present(row());
  assert.deepEqual(
    shown.events.map((event) => event.kind),
    ['status', 'reply']
  );
  assert.equal('priority' in shown, false);
  assert.equal('user' in shown, false);
  assert.equal('notes' in shown, false);
});

test('the panel is shown everything, with the reporter and a count of what was said', () => {
  const shown = present(row(), { forAdmin: true });
  assert.equal(shown.events.length, 4);
  assert.equal(shown.priority, 'high');
  assert.equal(shown.user.name, 'Jane Doe');
  assert.equal(shown.replies, 1);
  assert.equal(shown.notes, 1);
});

test('storage keys never leave the server, from a lean row or from a document', () => {
  for (const view of [{}, { forAdmin: true }]) {
    assert.equal('storageKey' in present(row(), view).attachments[0], false);
    const doc = new SupportReport({ ...row(), user: USER });
    assert.equal('storageKey' in present(doc, view).attachments[0], false);
    assert.equal(present(doc, view).attachments[0].url, '/uploads/a.png');
  }
});

test('an older Contact Us row, with no category or status stored, reads as a general open report', () => {
  const old = {
    _id: '65b000000000000000000002',
    user: USER,
    name: 'Jane',
    email: 'jane@example.com',
    subject: 'Hello',
    message: 'A question about currencies.',
  };
  const shown = present(old, { forAdmin: true });
  assert.equal(shown.category, 'general');
  assert.equal(shown.status, 'open');
  assert.equal(shown.priority, 'normal');
  assert.deepEqual(shown.events, []);
  assert.deepEqual(shown.attachments, []);
  assert.equal(shown.name, 'Jane');
});

test('a notification is cut at a word, with an ellipsis, and left alone when it fits', () => {
  assert.equal(shorten('Expense total is wrong', 60), 'Expense total is wrong');
  const cut = shorten('The settle button was pressed once and two entries appeared', 30);
  assert.ok(cut.length <= 30, cut);
  assert.ok(cut.endsWith('…'));
  assert.equal(cut, 'The settle button was pressed…');
  // One long word is cut mid-way rather than reduced to nothing.
  assert.equal(shorten('Supercalifragilisticexpialidocious', 10), 'Supercali…');
  assert.equal(shorten(undefined, 10), '');
});

test('the queue filter narrows by status and category, and searches title or reporter', () => {
  assert.deepEqual(buildQueueQuery({}), {});
  assert.deepEqual(buildQueueQuery({ status: 'open', category: 'bug' }), {
    status: 'open',
    category: 'bug',
  });

  const people = ['65a000000000000000000010'];
  const query = buildQueueQuery({ search: ' total (wrong) ' }, people);
  assert.equal(query.$or.length, 2);
  assert.ok(query.$or[0].subject.test('Expense TOTAL (wrong) again'));
  assert.equal(query.$or[0].subject.test('Expense total wrong'), false);
  assert.deepEqual(query.$or[1], { user: { $in: people } });

  // A search that matched nobody still searches titles; it does not match
  // every report by leaving the people clause out.
  const nobody = buildQueueQuery({ search: 'zzz' }, []);
  assert.deepEqual(nobody.$or[1], { user: { $in: [] } });
});

test('deleting an account takes its screenshots out of storage before the rows go', async (t) => {
  const order = [];
  t.mock.method(SupportReport, 'find', () => {
    const q = {
      select: () => q,
      lean: async () => [
        {
          attachments: [
            { storageKey: 'a.png', storageProvider: 'local' },
            { storageKey: '', storageProvider: 'local' },
          ],
        },
        { attachments: [{ storageKey: 'b.png', storageProvider: 'r2' }] },
      ],
    };
    return q;
  });
  t.mock.method(storage, 'remove', async (key, provider) => order.push(`remove ${provider}:${key}`));
  t.mock.method(SupportReport, 'deleteMany', async (filter) => order.push(`delete ${filter.user}`));

  await removeForUser(USER);
  assert.deepEqual(order, ['remove local:a.png', 'remove r2:b.png', `delete ${USER}`]);

  // Only rows with something attached are read; the keys are asked for by name.
  const [filter] = SupportReport.find.mock.calls[0].arguments;
  assert.deepEqual(filter, { user: USER, 'attachments.0': { $exists: true } });
});
