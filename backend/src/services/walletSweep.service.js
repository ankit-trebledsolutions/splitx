const walletService = require('./wallet.service');
const callBilling = require('./callBilling.service');

/**
 * The wallet's background work, once a minute:
 *  - finish any change a crash left applied to a balance but not yet in the
 *    history (walletService.recoverPending)
 *  - bill the calls that are live right now (callBilling.sweep)
 *
 * On every server, unlike the reminder sweep: both steps are keyed so that two
 * servers doing them at once still apply each change once.
 */
const SWEEP_EVERY_MS = 60 * 1000;

let timer = null;
let busy = false;

const tick = async () => {
  if (busy) return; // a slow pass must not overlap the next one
  busy = true;
  try {
    await walletService
      .recoverPending()
      .catch((err) => console.error('[wallet] recovery failed:', err.message));
    await callBilling.sweep().catch((err) => console.error('[calls] billing sweep failed:', err.message));
  } finally {
    busy = false;
  }
};

const start = () => {
  if (timer) return;
  timer = setInterval(tick, SWEEP_EVERY_MS);
  timer.unref();
  tick();
};

const stop = () => {
  clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, tick };
