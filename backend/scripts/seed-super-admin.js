/**
 * Creates the first admin panel owner, or promotes an existing account to one.
 *
 * Unlike everything else under scripts/, this one is MEANT to touch the real
 * database — there is no other way to get the first super admin in, since the
 * panel refuses to create staff unless a super admin is already signed in.
 * Because backend/.env points at the live cluster, it is built to be awkward to
 * fire by accident:
 *
 *   - it prints the database host and the action, then stops, unless --confirm
 *   - it refuses if a super admin already exists, unless --force
 *   - it never prints or logs the password
 *
 *   node scripts/seed-super-admin.js --email you@example.com --name "Your Name"
 *   node scripts/seed-super-admin.js --email you@example.com --confirm
 *
 * The password is read from ADMIN_SEED_PASSWORD so it stays out of your shell
 * history. Promoting an account that already exists leaves its password alone.
 */
const readline = require('readline');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/config/permissions');

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const has = (name) => argv.includes(`--${name}`);

const fail = (message) => {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
};

// Shows where this is about to write, without leaking the credentials in the
// URI. Parsed by hand rather than with new URL(): a replica set is written as a
// comma-separated host list (host1:27017,host2:27017,...), which URL rejects —
// and this line failing is worse than useless, because it is the one thing
// standing between a confirmation and writing to the wrong database.
const describeTarget = (uri) => {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const withoutCreds = afterScheme.replace(/^[^@/]*@/, '');
  const [hostPart = '', rest = ''] = withoutCreds.split(/\/(.*)/, 2);
  const hosts = hostPart.split(',').map((h) => h.trim()).filter(Boolean);
  const database = rest.split('?')[0] || '(default)';

  if (hosts.length === 0) return '(could not read host from connection string)';
  // One line for a single host, "first (+N more)" for a replica set.
  const shown = hosts.length === 1 ? hosts[0] : `${hosts[0]} (+${hosts.length - 1} more)`;
  const live = /mongodb\.net/i.test(hostPart) ? '  <-- ATLAS (LIVE)' : '';
  return `${shown} / ${database}${live}`;
};

const confirmPrompt = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });

const run = async () => {
  const email = (flag('email') || '').toLowerCase().trim();
  const name = flag('name');
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email) fail('Pass --email you@example.com');
  if (password && password.length < 8) fail('ADMIN_SEED_PASSWORD must be at least 8 characters');

  console.log('\n  Admin panel — seed super admin');
  console.log(`  database : ${describeTarget(env.mongoUri)}`);
  console.log(`  account  : ${email}`);

  await mongoose.connect(env.mongoUri);

  try {
    const existingOwners = await User.countDocuments({ role: ROLES.SUPER_ADMIN });
    if (existingOwners > 0 && !has('force')) {
      fail(
        `${existingOwners} super admin(s) already exist. Promote another one from the panel, ` +
          'or re-run with --force if you are certain.'
      );
    }

    const existing = await User.findOne({ email });
    const action = existing ? 'PROMOTE an existing account' : 'CREATE a new account';
    console.log(`  action   : ${action}\n`);

    if (!existing && !password) {
      fail(
        `No account exists for ${email}. Either re-run with an email that is ` +
          'already registered (it will be promoted, keeping its password), or set ' +
          'ADMIN_SEED_PASSWORD to create a brand new admin account.'
      );
    }

    if (!has('confirm')) {
      const answer = await confirmPrompt('  Type "yes" to continue: ');
      if (answer !== 'yes') fail('Cancelled. Nothing was written.');
    }

    if (existing) {
      existing.role = ROLES.SUPER_ADMIN;
      existing.isActive = true;
      // A super admin ignores the permission map, so leaving one behind would
      // only mislead whoever reads the record later.
      existing.permissions = undefined;
      // Only when a new one was supplied: promoting must not silently reset it.
      if (password) existing.password = password;
      await existing.save();
      console.log(`\n  ✓ ${email} is now a super admin.\n`);
    } else {
      await User.create({
        name: name || email.split('@')[0],
        email,
        password, // Hashed by the model's pre('save') hook.
        role: ROLES.SUPER_ADMIN,
        isActive: true,
        emailVerified: true, // Created by hand; there is nobody to email a code to.
      });
      console.log(`\n  ✓ Created ${email} as a super admin.\n`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => fail(error.message));
