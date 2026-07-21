const { Router } = require('express');
const authRoutes = require('./auth.routes');
const groupRoutes = require('./group.routes');
const expenseRoutes = require('./expense.routes');

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/expenses', expenseRoutes);

module.exports = router;
