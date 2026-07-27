const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const ApiError = require('../utils/ApiError');
const groupService = require('./group.service');
const messageService = require('./message.service');
const notificationService = require('./notification.service');

const USER_FIELDS = 'name email';
const POPULATE = [
  { path: 'assignees', select: USER_FIELDS },
  { path: 'createdBy', select: USER_FIELDS },
  { path: 'source.user', select: USER_FIELDS },
];

const listTasks = async (groupId, userId) => {
  await groupService.getGroupForMember(groupId, userId);
  return Task.find({ group: groupId }).populate(POPULATE).sort({ status: 1, dueAt: 1, createdAt: -1 });
};

const createTask = async (userId, groupId, payload) => {
  const group = await groupService.getGroupForMember(groupId, userId);
  const memberIds = new Set(group.members.map((m) => m._id.toString()));

  const assignees = payload.assignees ?? [];
  for (const assignee of assignees) {
    if (!memberIds.has(assignee.toString())) {
      throw ApiError.badRequest('Assignees must be group members');
    }
  }

  const task = await Task.create({
    group: groupId,
    title: payload.title,
    notes: payload.notes,
    priority: payload.priority,
    assignees,
    dueAt: payload.dueAt ?? null,
    source: payload.source ?? {},
    createdBy: userId,
  });

  await task.populate(POPULATE);
  await messageService.postActivity({
    groupId,
    senderId: userId,
    type: 'task',
    text: task.title,
    task: task._id,
  });

  await notificationService.notifyGroup({
    groupId,
    actorId: userId,
    type: 'task',
    title: 'Task Added',
    body: `New task "${task.title}" was added to your shared list.`,
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

  const fields = ['title', 'notes', 'priority', 'assignees', 'dueAt'];
  for (const field of fields) {
    if (payload[field] !== undefined) task[field] = payload[field];
  }

  if (payload.status !== undefined) {
    task.status = payload.status;
    task.completedAt = payload.status === 'done' ? new Date() : null;
  }

  await task.save();
  return task.populate(POPULATE);
};

const deleteTask = async (taskId, userId) => {
  const task = await getTaskForMember(taskId, userId);
  if (!task.createdBy._id.equals(userId)) {
    throw ApiError.forbidden('Only the task creator can delete it');
  }
  await Reminder.deleteMany({ task: task._id });
  await messageService.deleteForEntity('task', task._id);
  await task.deleteOne();
};

module.exports = { listTasks, createTask, getTaskForMember, updateTask, deleteTask };
