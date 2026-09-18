// Where a notification leads when tapped: the same answer whether it was tapped
// in the in-app list or as a push on the lock screen.

// Notifications about something inside a group open that group on the right tab.
const GROUP_TAB = {
  expense: 'expenses',
  task: 'tasks',
  reminder: 'reminders',
  itinerary: 'itinerary',
  photo: 'gallery',
  attraction: 'attractions',
  stay: 'stays',
  member: 'chat', // "friend joined": say hello
};

/**
 * Returns [screenName, params] for a notification, or null when there is
 * nowhere sensible to go (e.g. "you were removed from the group").
 *
 * Accepts a stored notification ({ type, group, entityId, ... }) or the flat
 * shape a push carries ({ type, groupId, entityId, conversationId, ... }).
 */
export const routeForNotification = (notification = {}) => {
  const { type, entityId, conversationId } = notification;
  const groupId = notification.group?._id ?? notification.group ?? notification.groupId;

  if (type === 'dm' && conversationId) return ['DirectChat', { conversationId }];
  // Expenses get the summary screen first; it links on to the full expense.
  if (type === 'expense' && entityId) return ['NotificationDetail', { notification }];
  if (type === 'task' && entityId) return ['TaskDetail', { taskId: entityId }];
  if (groupId) return ['GroupChat', { groupId, initialTab: GROUP_TAB[type] ?? 'chat' }];
  return null;
};
