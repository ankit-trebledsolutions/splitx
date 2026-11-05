const Task = require('../models/Task');
const Message = require('../models/Message');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');
const reminderService = require('./reminder.service');

const USER_FIELDS = 'name email';
const POPULATE = [
  { path: 'assignees', select: USER_FIELDS },
  { path: 'createdBy', select: USER_FIELDS },
  { path: 'completedBy', select: USER_FIELDS },
  { path: 'source.user', select: USER_FIELDS },
];

const idsOf = (users) => users.map((user) => user?._id ?? user);

// Assignees are shown to the whole group with their name and email, so each
// must already be in it: anyone else would be a stranger's details handed out.
const assertMembers = (group, userIds) => {
  const memberIds = new Set(group.members.map((m) => m._id.toString()));
  for (const id of userIds) {
    if (!memberIds.has(id.toString())) throw ApiError.badRequest('Assignees must be group members');
  }
};

/**
 * Where a task made from a chat message came from. The quoted person is
 * whoever sent that message in this group, read from the message itself
 * rather than taken from the request, so a request cannot put an outsider's
 * name and email on the card. Without a message, only a member may be named.
 */
const sourceFor = async (group, source) => {
  if (!source) return {};
  const { message: messageId, user, text, at } = source;
  if (messageId) {
    const message = await Message.findOne({ _id: messageId, group: group._id }).select('sender createdAt').lean();
    if (!message) throw ApiError.badRequest('The quoted message is not in this group');
    return { message: message._id, user: message.sender ?? undefined, text, at: at ?? message.createdAt };
  }
  if (user && !group.members.some((m) => m._id.equals(user))) {
    throw ApiError.badRequest('The quoted person must be a group member');
  }
  return { user, text, at };
};

const listTasks = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Task.find({ group: groupId }).populate(POPULATE).sort({ status: 1, dueAt: 1, createdAt: -1 });
};

const createTask = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);

  const assignees = payload.assignees ?? [];
  assertMembers(group, assignees);
  const source = await sourceFor(group, payload.source);

  const task = await Task.create({
    group: groupId,
    title: payload.title,
    notes: payload.notes,
    priority: payload.priority,
    assignees,
    dueAt: payload.dueAt ?? null,
    subtasks: payload.subtasks ?? [],
    links: payload.links ?? [],
    source,
    createdBy: userId,
  });

  await task.populate(POPULATE);
  // The card names who the task is for ("Task added for Rajeev").
  await messageService.postActivity({
    groupId,
    senderId: userId,
    type: 'task',
    text: task.title,
    task: task._id,
    assignees: idsOf(task.assignees),
  });

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'task',
    title: 'Task Added',
    body: `New task "${task.title}" was added to your shared list.`,
    entityId: task._id,
  });

  return task;
};

const getTaskForMember = async (taskId, userId) => {
  const task = await Task.findById(taskId).populate(POPULATE);
  if (!task) throw ApiError.notFound('Task not found');
  await groupService.getGroupForMember(task.group, userId);
  return task;
};

const updateTask = async (taskId, userId, payload) => {
  const task = await getTaskForMember(taskId, userId);
  const wasDone = task.status === 'done';
  // The same rule as createTask: nobody outside the group can be assigned.
  if (payload.assignees !== undefined) {
    assertMembers(await groupService.getGroupForMember(task.group, userId), payload.assignees);
  }

  const fields = ['title', 'notes', 'priority', 'assignees', 'dueAt', 'subtasks', 'links'];
  for (const field of fields) {
    if (payload[field] !== undefined) task[field] = payload[field];
  }

  // Only a real change of status moves these: sending "done" again for a task
  // that is already done keeps who finished it and when.
  if (payload.status === 'done' && !wasDone) {
    task.status = 'done';
    task.completedAt = new Date();
    task.completedBy = userId;
  } else if (payload.status === 'open') {
    task.status = 'open';
    task.completedAt = null;
    task.completedBy = null;
  }

  await task.save();
  await task.populate(POPULATE);

  // "Task completed" in the chat, naming who it was for and who did it (the
  // card's sender). Reopening takes the card back, so the chat never says a
  // task is done while it is open, and ticking it again posts a fresh one.
  if (task.status === 'done' && !wasDone) {
    await messageService.postActivity({
      groupId: task.group,
      senderId: userId,
      type: 'task_done',
      text: task.title,
      task: task._id,
      assignees: idsOf(task.assignees),
    });
  } else if (task.status === 'open' && wasDone) {
    await messageService.removeCards({ task: task._id, type: 'task_done' });
  }

  return task;
};

const deleteTask = async (taskId, userId) => {
  const task = await getTaskForMember(taskId, userId);
  if (!task.createdBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the task creator can delete it');
  }
  await reminderService.removeForTask(task._id);
  await messageService.deleteForEntity('task', task._id);
  await task.deleteOne();
};

module.exports = { listTasks, createTask, getTaskForMember, updateTask, deleteTask };
