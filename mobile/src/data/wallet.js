// Words for the credits wallet. The values are the server's
// (backend/src/models/CreditTransaction.js); the words are the app's.

// Who adds and removes credits by hand, as the history names them.
const TEAM = 'the Splix team';

const FEATURES = {
  ai_itinerary: { label: 'AI itinerary', icon: 'sparkles' },
  call: { label: 'Group call', icon: 'call' },
};

// "12 credits" / "1 credit"
export const creditsLabel = (amount) => {
  const value = Number(amount) || 0;
  return `${value.toLocaleString()} ${Math.abs(value) === 1 ? 'credit' : 'credits'}`;
};

// The balance where there is only room for a few characters (Home's top row):
// "1,240", then "12.4k" and "1.2M". Rounded down, never up: it must not show
// more than the person has.
export const compactCredits = (amount) => {
  const value = Math.max(Math.floor(Number(amount) || 0), 0);
  if (value < 10000) return value.toLocaleString();
  const [unit, letter] = value < 1000000 ? [1000, 'k'] : [1000000, 'M'];
  const tenths = Math.floor((value / unit) * 10) / 10;
  return `${tenths >= 100 ? Math.floor(tenths) : tenths}${letter}`;
};

// A price of 0 means the feature is free right now: no cost is shown anywhere.
export const isPaid = (price) => Number(price) > 0;

// How a history row reads: { title, detail?, icon }.
export const transactionLabel = (tx) => {
  const feature = FEATURES[tx.feature];
  switch (tx.type) {
    case 'bonus':
      return { title: 'Welcome bonus', icon: 'gift' };
    case 'monthly':
      return {
        title: 'Monthly free credits',
        detail: `Topped up to ${Number(tx.freeAfter).toLocaleString()}`,
        icon: 'calendar',
      };
    case 'spend':
      return { title: feature?.label ?? 'Credits used', icon: feature?.icon ?? 'remove-circle' };
    case 'refund':
      return { title: feature ? `Refund · ${feature.label}` : 'Refund', icon: 'arrow-undo' };
    case 'grant':
      return { title: `Added by ${TEAM}`, icon: 'add-circle' };
    case 'deduct':
      return { title: `Removed by ${TEAM}`, icon: 'remove-circle' };
    default:
      return { title: 'Credits', icon: 'wallet' };
  }
};

// What starting each paid feature is called in "Not enough credits".
export const featureAction = (feature) =>
  ({
    ai_itinerary: 'Planning a trip with AI',
    call: 'Starting a group call',
  })[feature] ?? 'This';

// Subject of the message the "Contact support" buttons start.
export const MORE_CREDITS_SUBJECT = 'More credits';
