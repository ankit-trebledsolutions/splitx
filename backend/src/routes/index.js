const { Router } = require('express');
const authRoutes = require('./auth.routes');
const groupRoutes = require('./group.routes');
const expenseRoutes = require('./expense.routes');
const taskRoutes = require('./task.routes');
const reminderRoutes = require('./reminder.routes');
const itineraryRoutes = require('./itinerary.routes');
const photoRoutes = require('./photo.routes');
const attractionRoutes = require('./attraction.routes');
const stayRoutes = require('./stay.routes');
const notificationRoutes = require('./notification.routes');
const supportRoutes = require('./support.routes');

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/expenses', expenseRoutes);
router.use('/tasks', taskRoutes);
router.use('/reminders', reminderRoutes);
router.use('/itinerary-days', itineraryRoutes);
router.use('/photos', photoRoutes);
router.use('/attractions', attractionRoutes);
router.use('/stays', stayRoutes);
router.use('/notifications', notificationRoutes);
router.use('/support', supportRoutes);

module.exports = router;
