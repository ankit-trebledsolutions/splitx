const Wallet = require('../models/Wallet');
const CreditTransaction = require('../models/CreditTransaction');
const WalletSettings = require('../models/WalletSettings');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const realtime = require('../realtime/socket');
const { ROLES } = require('../config/permissions');

const { DEFAULTS } = WalletSettings;

/**
 * Credits. The one place that changes a balance: everything else (the AI
 * planner, calls, the admin panel) asks this service.
 *
 * The rules that keep it honest:
 *  - The balance lives only here. The app is shown it and can never set it.
 *  - Every change has a unique key, so nothing is applied twice.
 *  - Every change is checked and written in one step against the version that
 *    was read, so two requests at once cannot both spend the same credits.
 *  - Every change becomes a CreditTransaction, and checkBalances() proves the
 *    history adds up to the balance.
 */

// How many times a change is worked out again after losing a race for the
// wallet. Only one person's own requests compete for it (a double tap, a call
// block landing with an AI plan), so this is generous. Each retry waits a few
// random milliseconds so that the losers do not collide again in step.
const MAX_ATTEMPTS = 20;
const backOff = () => new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)));

// A pending change older than this was left by a crash, not by a request that
// is still finishing it.
const RECOVER_AFTER_MS = 60 * 1000;

// Each feature's price in WalletSettings.prices.
const PRICE_KEYS = { ai_itinerary: 'aiItinerary', call: 'callBlock' };

const monthOf = (date = new Date()) => date.toISOString().slice(0, 7);

// When this month's free credits are replaced: the start of next month, UTC.
const nextMonthStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

const isDuplicateKey = (err) => err?.code === 11000;

// ---- Settings ----------------------------------------------------------------

const withDefaults = (doc) => ({
  prices: { ...DEFAULTS.prices, ...(doc?.prices ?? {}) },
  callBlockMinutes: doc?.callBlockMinutes ?? DEFAULTS.callBlockMinutes,
  signupBonus: doc?.signupBonus ?? DEFAULTS.signupBonus,
  monthlyFree: doc?.monthlyFree ?? DEFAULTS.monthlyFree,
  coAdminGrantCap: doc?.coAdminGrantCap ?? DEFAULTS.coAdminGrantCap,
  updatedAt: doc?.updatedAt ?? null,
});

// Read every time rather than cached: a price an owner just changed applies to
// the very next request, on every server.
const getSettings = async () => withDefaults(await WalletSettings.findOne({ key: 'wallet' }).lean());

const updateSettings = async (values, actor) => {
  const doc = await WalletSettings.findOneAndUpdate(
    { key: 'wallet' },
    {
      $set: {
        'prices.aiItinerary': values.prices.aiItinerary,
        'prices.callBlock': values.prices.callBlock,
        callBlockMinutes: values.callBlockMinutes,
        signupBonus: values.signupBonus,
        monthlyFree: values.monthlyFree,
        coAdminGrantCap: values.coAdminGrantCap,
        updatedBy: actor._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return withDefaults(doc);
};

const priceOf = (settings, feature) => {
  const key = PRICE_KEYS[feature];
  if (!key) throw new Error(`Unknown paid feature: ${feature}`);
  return settings.prices[key] ?? 0;
};

// ---- How a change splits across the pots (pure, exported for tests) ----------

const totalOf = (wallet) => wallet.free + wallet.paid;

const noCredits = (needed, balance, feature) =>
  new ApiError(402, `This needs ${needed} credits. You have ${Math.max(balance, 0)}.`, {
    code: 'NO_CREDITS',
    data: { needed, balance: Math.max(balance, 0), feature },
  });

// Free credits go first: they are replaced at the end of the month anyway.
const spendSplit = (wallet, amount, feature = null) => {
  const balance = totalOf(wallet);
  if (balance < amount) throw noCredits(amount, balance, feature);
  const fromFree = Math.min(Math.max(wallet.free, 0), amount);
  return { free: -fromFree, paid: -(amount - fromFree) };
};

// An admin correction takes back what was given before touching the month's
// free credits.
const deductSplit = (wallet, amount) => {
  const balance = totalOf(wallet);
  if (balance < amount) {
    throw ApiError.badRequest(`They have ${Math.max(balance, 0)} credits, so ${amount} cannot be deducted.`);
  }
  const fromPaid = Math.min(Math.max(wallet.paid, 0), amount);
  return { free: -(amount - fromPaid), paid: -fromPaid };
};

// ---- Applying a change -----------------------------------------------------------

const toClient = (wallet) => ({
  balance: Math.max(totalOf(wallet), 0),
  free: Math.max(wallet.free, 0),
  paid: Math.max(wallet.paid, 0),
});

/**
 * Copies an applied change into the history and clears it from the wallet.
 * Safe to run twice, and from any server: the history key is unique.
 */
const settle = async (walletId, userId, entry) => {
  let tx;
  try {
    tx = await CreditTransaction.create({
      user: userId,
      key: entry.key,
      type: entry.type,
      amount: entry.free + entry.paid,
      free: entry.free,
      paid: entry.paid,
      freeAfter: entry.freeAfter,
      paidAfter: entry.paidAfter,
      balanceAfter: entry.freeAfter + entry.paidAfter,
      feature: entry.feature ?? null,
      ref: entry.ref ?? null,
      note: entry.note ?? null,
      by: entry.by ?? null,
      createdAt: entry.at,
    });
    tx = tx.toObject();
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    tx = await CreditTransaction.findOne({ key: entry.key }).lean();
  }
  // Not a version bump: removing the note changes no balance, and a $pull
  // cannot undo anything another change has written meanwhile.
  await Wallet.updateOne({ _id: walletId }, { $pull: { pending: { key: entry.key } } });
  return tx;
};

const announce = async (userId) => {
  const wallet = await Wallet.findOne({ user: userId }).lean();
  if (wallet) realtime.emitToUser(userId, 'wallet:updated', toClient(wallet));
};

/**
 * Applies one change to a wallet, at most once per key.
 *
 *   compute(wallet) -> { free, paid }   what to add to each pot (negative to
 *                                       take away); throws to refuse
 *
 * Resolves to the history row. A key already used resolves to that first row
 * and changes nothing, whatever `compute` would say now.
 */
const applyOp = async (userId, op) => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const done = await CreditTransaction.findOne({ key: op.key }).lean();
    if (done) return done;

    // eslint-disable-next-line no-await-in-loop
    const wallet = await Wallet.findOne({ user: userId }).lean();
    if (!wallet) throw new Error(`No wallet for ${userId}`);

    // Applied by an earlier attempt (or another server) that has not written
    // the history yet: finish it rather than apply it again.
    const inFlight = (wallet.pending ?? []).find((entry) => entry.key === op.key);
    if (inFlight) {
      // eslint-disable-next-line no-await-in-loop
      const tx = await settle(wallet._id, userId, inFlight);
      // eslint-disable-next-line no-await-in-loop
      await announce(userId);
      return tx;
    }

    const { free, paid } = op.compute(wallet);
    const entry = {
      key: op.key,
      type: op.type,
      free,
      paid,
      freeAfter: wallet.free + free,
      paidAfter: wallet.paid + paid,
      feature: op.feature ?? null,
      ref: op.ref ?? null,
      note: op.note ?? null,
      by: op.by ?? null,
      at: new Date(),
    };
    const $set = { free: entry.freeAfter, paid: entry.paidAfter };
    if (op.freeMonth) $set.freeMonth = op.freeMonth;

    // eslint-disable-next-line no-await-in-loop
    const written = await Wallet.updateOne(
      { _id: wallet._id, version: wallet.version },
      { $set, $inc: { version: 1 }, $push: { pending: entry } }
    );
    if (written.modifiedCount === 1) {
      // eslint-disable-next-line no-await-in-loop
      const tx = await settle(wallet._id, userId, entry);
      // eslint-disable-next-line no-await-in-loop
      await announce(userId);
      return tx;
    }
    // Something else changed the wallet after it was read. Work it out again.
    // eslint-disable-next-line no-await-in-loop
    await backOff();
  }
  throw new ApiError(503, 'Your credits are busy. Try again in a moment.', { code: 'WALLET_BUSY' });
};

/**
 * Makes sure the person has a wallet and this month's free credits. Every
 * public entry point starts here, so a wallet appears the first time anything
 * touches it, existing accounts included, with the signup bonus.
 */
const ensureWallet = async (userId, settings) => {
  const config = settings ?? (await getSettings());
  let wallet = await Wallet.findOne({ user: userId }).lean();

  if (!wallet) {
    try {
      await Wallet.create({ user: userId });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    if (config.signupBonus > 0) {
      await applyOp(userId, {
        key: `bonus:${userId}`,
        type: 'bonus',
        compute: () => ({ free: 0, paid: config.signupBonus }),
      });
    }
    wallet = await Wallet.findOne({ user: userId }).lean();
  }

  const month = monthOf();
  if (wallet.freeMonth !== month) {
    const change = config.monthlyFree - Math.max(wallet.free, 0);
    if (change === 0) {
      // Nothing to record; only the month moves on.
      await Wallet.updateOne(
        { _id: wallet._id, freeMonth: wallet.freeMonth },
        { $set: { freeMonth: month }, $inc: { version: 1 } }
      );
    } else {
      await applyOp(userId, {
        key: `monthly:${userId}:${month}`,
        type: 'monthly',
        freeMonth: month,
        // Worked out against the wallet as it is when written, not as read above.
        compute: (current) => ({ free: config.monthlyFree - Math.max(current.free, 0), paid: 0 }),
      });
    }
    wallet = await Wallet.findOne({ user: userId }).lean();
  }
  return wallet;
};

// ---- Paid features ---------------------------------------------------------------

/**
 * Takes the price of `feature` (times `units`) from the person. Resolves to the
 * history row, or null when the feature is free right now. Throws 402
 * NO_CREDITS when they cannot pay, and charges nothing.
 *
 * `key` must name this one use (`ai:<jobId>`), so a retry is not charged twice.
 */
const charge = async (userId, { feature, key, ref = null, units = 1 }) => {
  const settings = await getSettings();
  const amount = priceOf(settings, feature) * units;
  if (!(amount > 0)) return null;
  await ensureWallet(userId, settings);
  return applyOp(userId, {
    key,
    type: 'spend',
    feature,
    ref,
    compute: (wallet) => spendSplit(wallet, amount, feature),
  });
};

/**
 * Gives back a charge, into the pots it came from. Resolves to the refund row,
 * or null when there was nothing to give back (the feature was free, or this
 * charge never happened). Refunding twice refunds once.
 */
const refund = async (chargeKey) => {
  const spent = await CreditTransaction.findOne({ key: chargeKey, type: 'spend' }).lean();
  if (!spent) return null;
  return applyOp(spent.user, {
    key: `refund:${chargeKey}`,
    type: 'refund',
    feature: spent.feature,
    ref: spent.ref,
    compute: () => ({ free: -spent.free, paid: -spent.paid }),
  });
};

// For callers that must not fail because a refund did: it is logged, and the
// charge stays in the history for an admin to put right.
const refundQuietly = (chargeKey) =>
  refund(chargeKey).catch((err) => {
    console.error(`[wallet] refund of ${chargeKey} failed:`, err.message);
    return null;
  });

const balanceOf = async (userId) => toClient(await ensureWallet(userId)).balance;

// ---- The app ---------------------------------------------------------------------

const getForUser = async (userId) => {
  const settings = await getSettings();
  const wallet = await ensureWallet(userId, settings);
  return {
    ...toClient(wallet),
    monthlyFree: settings.monthlyFree,
    freeRenewsAt: nextMonthStart(),
    prices: {
      aiItinerary: settings.prices.aiItinerary,
      callBlock: settings.prices.callBlock,
      callBlockMinutes: settings.callBlockMinutes,
    },
  };
};

// What the app may see of a history row: never the admin's note or who they are.
const rowForApp = (tx) => ({
  id: tx._id,
  type: tx.type,
  amount: tx.amount,
  feature: tx.feature,
  balanceAfter: Math.max(tx.balanceAfter, 0),
  freeAfter: Math.max(tx.freeAfter, 0),
  createdAt: tx.createdAt,
});

const pageOf = async (filter, { page, limit }, shape, populate = []) => {
  let query = CreditTransaction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  for (const path of populate) query = query.populate(path.path, path.select);
  const [rows, total] = await Promise.all([query.lean(), CreditTransaction.countDocuments(filter)]);
  return { items: rows.map(shape), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

const listForUser = async (userId, paging) => {
  await ensureWallet(userId);
  return pageOf({ user: userId }, paging, rowForApp);
};

// ---- The admin panel -------------------------------------------------------------

const rowForAdmin = (tx) => ({
  ...rowForApp(tx),
  free: tx.free,
  paid: tx.paid,
  ref: tx.ref,
  note: tx.note,
  by: tx.by ? { id: tx.by._id ?? tx.by, name: tx.by.name ?? null } : null,
  user: tx.user?._id
    ? { id: tx.user._id, name: tx.user.name, email: tx.user.email }
    : { id: tx.user },
});

const BY = { path: 'by', select: 'name' };
const WHO = { path: 'user', select: 'name email' };

// The admin functions below take the account already looked up through
// admin.service getUser, which keeps owners invisible to co-admins. Looking it
// up here instead would mean requiring admin.service, which (through account
// deletion) requires the services that require this one.
const getForAdmin = async (user, paging) => {
  const wallet = await ensureWallet(user._id);
  return {
    wallet: { ...toClient(wallet), freeMonth: wallet.freeMonth },
    transactions: await pageOf({ user: user._id }, paging, rowForAdmin, [BY]),
  };
};

/**
 * An admin adds or takes away credits. `requestId` comes from the panel, one
 * per press of the button, so a double click or a retried request lands once.
 */
const adjust = async (user, { type, amount, reason, requestId }, actor) => {
  if (String(user._id) === String(actor._id)) {
    throw ApiError.badRequest('You cannot change your own credits');
  }
  const settings = await getSettings();
  if (actor.role !== ROLES.SUPER_ADMIN && amount > settings.coAdminGrantCap) {
    throw ApiError.forbidden(
      `Co-admins can ${type} up to ${settings.coAdminGrantCap} credits at a time. Ask an owner for more.`
    );
  }
  await ensureWallet(user._id, settings);
  const tx = await applyOp(user._id, {
    key: `admin:${user._id}:${requestId}`,
    type,
    note: reason,
    by: actor._id,
    compute: (wallet) => (type === 'grant' ? { free: 0, paid: amount } : deductSplit(wallet, amount)),
  });
  const wallet = await Wallet.findOne({ user: user._id }).lean();
  return { wallet: toClient(wallet), transaction: rowForAdmin(tx) };
};

// Owners' rows are left out for co-admins, like everywhere else in the panel.
const hiddenFrom = async (actor) =>
  actor.role === ROLES.SUPER_ADMIN ? [] : User.find({ role: ROLES.SUPER_ADMIN }).distinct('_id');

const listForAdmin = async ({ type, feature, page, limit }, actor) => {
  const filter = {};
  if (type) filter.type = type;
  if (feature) filter.feature = feature;
  const hidden = await hiddenFrom(actor);
  if (hidden.length) filter.user = { $nin: hidden };
  return pageOf(filter, { page, limit }, rowForAdmin, [WHO, BY]);
};

/**
 * Proves the history explains every balance: for each wallet, its pots must
 * equal the sum of its history plus whatever is still pending. Anything else
 * means a balance was changed outside this service. Resolves to the first few
 * that do not add up.
 */
const checkBalances = async (limit = 20) => {
  const [sums, wallets] = await Promise.all([
    CreditTransaction.aggregate([
      { $group: { _id: '$user', free: { $sum: '$free' }, paid: { $sum: '$paid' } } },
    ]),
    Wallet.find({}).select('user free paid pending').lean(),
  ]);
  const byUser = new Map(sums.map((sum) => [String(sum._id), sum]));
  const mismatches = [];
  for (const wallet of wallets) {
    const sum = byUser.get(String(wallet.user)) ?? { free: 0, paid: 0 };
    // Applied to the wallet but not yet in the history.
    for (const entry of wallet.pending ?? []) {
      sum.free += entry.free;
      sum.paid += entry.paid;
    }
    if (sum.free !== wallet.free || sum.paid !== wallet.paid) {
      mismatches.push({
        user: wallet.user,
        wallet: { free: wallet.free, paid: wallet.paid },
        history: { free: sum.free, paid: sum.paid },
      });
      if (mismatches.length >= limit) break;
    }
  }
  return { checked: wallets.length, mismatches };
};

const DAY_MS = 24 * 60 * 60 * 1000;

const summary = async () => {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [settings, held, recent, check] = await Promise.all([
    getSettings(),
    Wallet.aggregate([
      { $group: { _id: null, free: { $sum: '$free' }, paid: { $sum: '$paid' }, wallets: { $sum: 1 } } },
    ]),
    CreditTransaction.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { type: '$type', feature: '$feature' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    checkBalances(),
  ]);
  return {
    settings,
    held: {
      free: held[0]?.free ?? 0,
      paid: held[0]?.paid ?? 0,
      wallets: held[0]?.wallets ?? 0,
    },
    last30Days: recent.map((row) => ({
      type: row._id.type,
      feature: row._id.feature,
      amount: row.amount,
      count: row.count,
    })),
    check,
  };
};

// ---- Repair ------------------------------------------------------------------------

/**
 * Finishes changes a crash left applied to a balance but missing from the
 * history. Runs every minute (walletSweep) on every server; settle() makes
 * running it twice harmless.
 */
const recoverPending = async () => {
  const before = new Date(Date.now() - RECOVER_AFTER_MS);
  const wallets = await Wallet.find({ 'pending.at': { $lt: before } }).lean();
  let recovered = 0;
  for (const wallet of wallets) {
    for (const entry of wallet.pending.filter((item) => item.at < before)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await settle(wallet._id, wallet.user, entry);
        recovered += 1;
      } catch (err) {
        console.error(`[wallet] could not recover ${entry.key}:`, err.message);
      }
    }
  }
  return recovered;
};

module.exports = {
  getSettings,
  updateSettings,
  priceOf,
  spendSplit,
  deductSplit,
  monthOf,
  nextMonthStart,
  ensureWallet,
  applyOp,
  charge,
  refund,
  refundQuietly,
  balanceOf,
  getForUser,
  listForUser,
  getForAdmin,
  adjust,
  listForAdmin,
  checkBalances,
  summary,
  recoverPending,
};
