// Static dashboard content, mirroring the design mockup. Swap each block for a
// real API call as the endpoints land.

export const netBalance = {
  total: 1150,
  caption: "You're owed overall across 3 groups",
  youOwe: 84.5,
  owedToYou: 120,
};

export const quickActions = [
  { key: 'add-expense', icon: 'add', label: 'Add Expense', tint: '#17E695' },
  { key: 'create-group', icon: 'people-outline', label: 'Create Group', tint: '#4A7DF7' },
  { key: 'invite-friend', icon: 'person-add-outline', label: 'Invite Friend', tint: '#A78BFA' },
  { key: 'create-trip', icon: 'location-outline', label: 'Create Trip', tint: '#F59E0B' },
];

export const upcomingTrips = [
  {
    id: 't1',
    flag: '🇮🇩',
    name: 'Bali Escape',
    dates: 'Sep 2 – 10',
    amount: 565,
    members: 25,
    status: 'active',
  },
  {
    id: 't2',
    flag: '🇯🇵',
    name: 'Tokyo Getaway',
    dates: 'Nov 5 – 12',
    amount: null,
    members: 4,
    status: 'Not started',
  },
];

export const tasks = [
  {
    id: 'k1',
    tag: 'Booking',
    tagColor: '#F59E0B',
    title: 'Book Grand Hyatt',
    meta: 'Due Jul 10',
    done: false,
  },
  {
    id: 'k2',
    tag: 'Bills',
    tagColor: '#4A7DF7',
    title: 'Pay Electricity Bill',
    meta: 'Ongoing',
    done: false,
  },
  {
    id: 'k3',
    tag: 'Travel',
    tagColor: '#17E695',
    title: 'Confirm airport pickup',
    meta: 'Due Aug 28',
    done: true,
  },
];

export const recentExpenses = [
  {
    id: 'e1',
    icon: 'restaurant-outline',
    title: 'Ramen Dinner',
    meta: 'Paid by Alex · Today',
    amount: 68,
    share: 17,
    settled: false,
  },
  {
    id: 'e2',
    icon: 'bed-outline',
    title: 'Hotel — Night 3',
    meta: 'Paid by you · Yesterday',
    amount: 320,
    share: null,
    settled: true,
  },
  {
    id: 'e3',
    icon: 'car-outline',
    title: 'Airport Transfer',
    meta: 'Paid by Emily · Yesterday',
    amount: 54,
    share: 13.5,
    settled: false,
  },
  {
    id: 'e4',
    icon: 'cart-outline',
    title: 'Groceries Run',
    meta: 'Paid by you · Mon',
    amount: 96,
    share: null,
    settled: true,
  },
];
