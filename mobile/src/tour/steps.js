// The words of the guided tour, in one place.
//
// Two chapters, each shown once per account:
//   welcome  on Home right after sign-up: what a group is, where the + is
//   group    the first time any group is opened: what each tab is for
//
// A step is { key, title, body, target, advance, shape, tab, primary }:
//   target   the name a screen registered with useTourTarget / registerTarget,
//            or null for a card in the middle of a dimmed screen
//   advance  'next' (default): a Next button; 'tap': the highlighted control
//            itself is live, and tapping it moves the tour on
//   shape    'circle' for round buttons, otherwise a rounded rectangle
//   tab      the group tab the screen switches to while the step shows
//   primary  the label on the Next button, when it is not "Next"

export const CHAPTERS = {
  WELCOME: 'welcome',
  GROUP: 'group',
};

// Tab keys exactly as GroupChatScreen names them.
const TRIP_EXTRA_TABS = ['itinerary', 'gallery', 'attractions', 'stays'];
const OTHER_EXTRA_TABS = ['gallery', 'stays'];

export const extraTabsFor = (isTrip) => (isTrip ? TRIP_EXTRA_TABS : OTHER_EXTRA_TABS);

const welcomeSteps = ({ firstName, hasGroups }) => [
  {
    key: 'hello',
    target: null,
    title: firstName ? `Welcome to Splix, ${firstName}` : 'Welcome to Splix',
    body: hasGroups
      ? 'A quick look at where things are. It takes about half a minute.'
      : "Everything happens inside a group. Let's make yours.",
    primary: 'Show me',
  },
  {
    key: 'groups-tab',
    target: 'tab-groups',
    title: 'Your groups live here',
    body: 'Every trip, flat or event is a group. Tap Groups to open them.',
    advance: 'tap',
  },
  {
    key: 'groups-fab',
    target: 'groups-fab',
    shape: 'circle',
    title: hasGroups ? 'Create or join' : 'Make your first group',
    body: "Tap + to create a group, or join a friend's with their invite link.",
    advance: 'tap',
  },
];

const groupSteps = ({ isTrip }) => [
  {
    key: 'chat',
    target: 'group-tab-chat',
    tab: 'chat',
    title: 'Chat',
    body: 'Talk here. Photos, voice notes and calls live in the chat too.',
  },
  {
    key: 'expenses',
    target: 'group-tab-expenses',
    tab: 'expenses',
    title: 'Expenses',
    body: 'Add what you paid and Splix splits it. Balances update for everyone.',
  },
  {
    key: 'tasks',
    target: 'group-tab-tasks',
    tab: 'tasks',
    title: 'Tasks',
    body: 'Who does what. Tick them off as you go.',
  },
  {
    key: 'reminders',
    target: 'group-tab-reminders',
    tab: 'reminders',
    title: 'Reminders',
    body: "Set one and it rings on every member's phone, like an alarm.",
  },
  {
    key: 'more',
    target: 'group-tabs-more',
    tab: isTrip ? 'itinerary' : 'gallery',
    title: isTrip ? 'Itinerary, Gallery, Attractions and Stays' : 'Gallery and Stays',
    body: isTrip
      ? 'The plan, photos, places and hotels, all in the group.'
      : 'Photos and hotel bookings, kept with the group.',
  },
  {
    key: 'fab',
    target: 'group-fab',
    shape: 'circle',
    tab: 'chat',
    title: 'Add anything with +',
    body: "Whatever tab you're on, + adds to it. You're all set.",
    primary: 'Done',
  },
];

export const buildSteps = (chapter, context = {}) => {
  if (chapter === CHAPTERS.WELCOME) return welcomeSteps(context);
  if (chapter === CHAPTERS.GROUP) return groupSteps(context);
  return [];
};
