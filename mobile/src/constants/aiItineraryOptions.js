// The choices on the "Plan with AI" form. Every `value` is exactly what the
// server's validator accepts, so nothing is translated on the way out; only
// the labels and icons are the app's.

export const TRAVELLERS = [
  { value: 'friends', label: 'Friends', icon: 'people-outline' },
  { value: 'couple', label: 'Couple', icon: 'heart-outline' },
  { value: 'family_kids', label: 'Family with kids', icon: 'home-outline' },
  { value: 'with_elders', label: 'With elders', icon: 'accessibility-outline' },
  { value: 'solo', label: 'Solo', icon: 'person-outline' },
];

export const INTERESTS = [
  { value: 'sightseeing', label: 'Sightseeing', icon: 'camera-outline' },
  { value: 'food', label: 'Food', icon: 'restaurant-outline' },
  { value: 'nature', label: 'Nature', icon: 'leaf-outline' },
  { value: 'adventure', label: 'Adventure', icon: 'trail-sign-outline' },
  { value: 'shopping', label: 'Shopping', icon: 'bag-handle-outline' },
  { value: 'nightlife', label: 'Nightlife', icon: 'wine-outline' },
  { value: 'spiritual', label: 'Spiritual', icon: 'flower-outline' },
  { value: 'history', label: 'History', icon: 'library-outline' },
  { value: 'relaxing', label: 'Relaxing', icon: 'sunny-outline' },
];

export const PACE = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'packed', label: 'Packed' },
];

export const BUDGET = [
  { value: 'budget', label: 'Budget' },
  { value: 'mid', label: 'Mid-range' },
  { value: 'premium', label: 'Premium' },
];

export const TRANSPORT = [
  { value: 'own_car', label: 'Own car' },
  { value: 'cab', label: 'Cab' },
  { value: 'public_transport', label: 'Public transport' },
  { value: 'walking', label: 'Walking' },
];

export const FOOD = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'non_veg', label: 'Non-veg' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'jain', label: 'Jain' },
];

export const DAY_START = [
  { value: 'early', label: 'Early (7 AM)' },
  { value: 'normal', label: 'Normal (9 AM)' },
  { value: 'late', label: 'Late (10:30 AM)' },
];

export const ACCESSIBILITY = [
  { value: 'none', label: 'None' },
  { value: 'limited_walking', label: 'Limited walking' },
  { value: 'wheelchair', label: 'Wheelchair' },
];

// One run plans at most this many days; a longer trip gets its first 14.
export const MAX_AI_DAYS = 14;

// The server caps the group size it tells the AI at this.
export const MAX_AI_GROUP_SIZE = 50;

// Minutes since midnight the time steppers open on: 10:00 AM and 6:00 PM.
export const DEFAULT_ARRIVAL_MINUTES = 10 * 60;
export const DEFAULT_DEPARTURE_MINUTES = 18 * 60;

// Alerts raised from more than one screen, as [title, message], so the wording
// can't drift apart: AppAlert.alert(...AI_ALERTS.running).
export const AI_ALERTS = {
  notConfigured: [
    'AI planner is not available',
    'It has not been set up yet. You can still add days by hand.',
  ],
  running: ['AI is planning this itinerary', 'Try again in a moment.'],
  replaceForbidden: [
    'Only the admin can replan',
    'Only the group admin, or the member who added every existing day, can replace the itinerary.',
  ],
};

// Body of the "Replace itinerary?" confirmation.
export const replaceConfirmMessage = (dayCount) =>
  `AI will replace ${
    dayCount === 1 ? 'the existing day' : `all ${dayCount} days`
  }, including edits made by anyone in the group.`;

// What the form starts from. The member's answers from their last run in this
// group are laid over these, so a retry never starts from scratch.
export const DEFAULT_PREFS = {
  travellers: 'friends',
  interests: ['sightseeing', 'food'],
  pace: 'balanced',
  budget: 'mid',
  transport: 'cab',
  arrivalTime: null,
  departureTime: null,
  food: null,
  dayStart: 'normal',
  accessibility: 'none',
  notes: '',
};
