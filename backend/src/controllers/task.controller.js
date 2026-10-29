const asyncHandler = require('../utils/asyncHandler');
const taskService = require('../services/task.service');

const listTasks = asyncHandler(async (req, res) => {
  const tasks = await taskService.listTasks(req.params.groupId, req.user._id);
  res.json({ success: true, data: { tasks } });
});

const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.user._id, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: { task } });
});

const getTask = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskForMember(req.params.taskId, req.user._id);
  res.json({ success: true, data: { task } });
});

const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(req.params.taskId, req.user._id, req.body);
  res.json({ success: true, data: { task } });
});

const deleteTask = asyncHandler(async (req, res) => {
  await taskService.deleteTask(req.params.taskId, req.user._id);
  res.json({ success: true, message: 'Task deleted' });
});

module.exports = { listTasks, createTask, getTask, updateTask, deleteTask };
