const { Router } = require('express');
const authRoutes = require('./auth.routes');
const groupRoutes = require('./group.routes');
const expenseRoutes = require('./expense.routes');
const taskRoutes = require('./task.routes');
const reminderRoutes = require('./reminder.routes');

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/expenses', expenseRoutes);
router.use('/tasks', taskRoutes);
router.use('/reminders', reminderRoutes);

module.exports = router;
