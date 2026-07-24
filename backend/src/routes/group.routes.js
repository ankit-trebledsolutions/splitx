const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const groupController = require('../controllers/group.controller');
const expenseController = require('../controllers/expense.controller');
const messageController = require('../controllers/message.controller');
const taskController = require('../controllers/task.controller');
const reminderController = require('../controllers/reminder.controller');
const itineraryController = require('../controllers/itinerary.controller');
const photoController = require('../controllers/photo.controller');
const attractionController = require('../controllers/attraction.controller');
const stayController = require('../controllers/stay.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createGroupSchema = {
  body: z.object({
    name: z.string().min(2, 'Group name must be at least 2 characters').max(80),
    description: z.string().max(300).optional(),
    groupType: z.enum(['trip', 'home', 'couple', 'event', 'other']).default('trip'),
    totalDays: z.number().int().min(1).max(365).optional(),
  }),
};

const joinGroupSchema = {
  body: z.object({
    inviteCode: z.string().min(4, 'Invite code is required').max(16),
  }),
};

const groupParams = { params: z.object({ groupId: objectId }) };

const createExpenseSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    description: z.string().min(1, 'Description is required').max(200),
    amount: z.number().positive('Amount must be greater than 0'),
    paidBy: objectId,
    splitType: z.enum(['equal', 'exact']).default('equal'),
    participants: z.array(objectId).optional(),
    splits: z.array(z.object({ user: objectId, amount: z.number().nonnegative() })).optional(),
    category: z
      .enum([
        'general',
        'food',
        'stay',
        'travel',
        'fun',
        'shopping',
        'transport',
        'housing',
        'entertainment',
        'utilities',
        'other',
      ])
      .optional(),
    date: z.coerce.date().optional(),
  }),
};

const sendMessageSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({ text: z.string().min(1, 'Message cannot be empty').max(2000) }),
};

const createTaskSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    title: z.string().min(1, 'Task title is required').max(200),
    notes: z.string().max(500).optional(),
    priority: z.enum(['high', 'med', 'low']).default('med'),
    assignees: z.array(objectId).optional(),
    dueAt: z.coerce.date().nullish(),
    source: z
      .object({
        message: objectId.optional(),
        user: objectId.optional(),
        text: z.string().max(2000).optional(),
        at: z.coerce.date().optional(),
      })
      .optional(),
  }),
};

const createReminderSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    title: z.string().min(1, 'Reminder title is required').max(200),
    subtitle: z.string().max(200).optional(),
    remindAt: z.coerce.date(),
    scope: z.enum(['group', 'me']).default('group'),
    icon: z.string().max(40).optional(),
    task: objectId.optional(),
  }),
};

const createItineraryDaySchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    title: z.string().min(1, 'Day title is required').max(120),
    date: z.coerce.date().nullish(),
    dayNumber: z.number().int().min(1).max(365).optional(),
    activities: z
      .array(
        z.object({
          time: z.string().max(20).optional(),
          title: z.string().min(1).max(200),
          icon: z.string().max(40).optional(),
          note: z.string().max(300).optional(),
        })
      )
      .optional(),
  }),
};

const addPhotoSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    emoji: z.string().max(8).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i, 'Colour must be a hex code')
      .optional(),
    imageUrl: z.string().url().max(2000).optional(),
    caption: z.string().max(200).optional(),
    taggedMembers: z.array(objectId).optional(),
  }),
};

const createAttractionSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    name: z.string().min(1, 'Attraction name is required').max(120),
    category: z.string().max(60).optional(),
    rating: z.number().min(0).max(5).optional(),
    distanceKm: z.number().min(0).max(10000).optional(),
    emoji: z.string().max(8).optional(),
  }),
};

const createStaySchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    name: z.string().min(1, 'Stay name is required').max(120),
    stars: z.number().int().min(1).max(5).optional(),
    status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    guests: z.number().int().min(1).max(50).optional(),
    pricePerNight: z.number().nonnegative(),
    amenities: z.array(z.string().max(40)).max(12).optional(),
    address: z.string().max(200).optional(),
    emoji: z.string().max(8).optional(),
  }),
};

router.post('/', validate(createGroupSchema), groupController.createGroup);
router.get('/', groupController.listGroups);
router.post('/join', validate(joinGroupSchema), groupController.joinGroup);
router.get('/:groupId', validate(groupParams), groupController.getGroup);
router.post('/:groupId/leave', validate(groupParams), groupController.leaveGroup);
router.get('/:groupId/balances', validate(groupParams), groupController.getBalances);

router.post('/:groupId/expenses', validate(createExpenseSchema), expenseController.createExpense);
router.get('/:groupId/expenses', validate(groupParams), expenseController.listExpenses);

router.get('/:groupId/messages', validate(groupParams), messageController.listMessages);
router.post('/:groupId/messages', validate(sendMessageSchema), messageController.sendMessage);

router.get('/:groupId/tasks', validate(groupParams), taskController.listTasks);
router.post('/:groupId/tasks', validate(createTaskSchema), taskController.createTask);

router.get('/:groupId/reminders', validate(groupParams), reminderController.listReminders);
router.post('/:groupId/reminders', validate(createReminderSchema), reminderController.createReminder);

router.get('/:groupId/itinerary', validate(groupParams), itineraryController.listDays);
router.post('/:groupId/itinerary', validate(createItineraryDaySchema), itineraryController.createDay);

router.get('/:groupId/photos', validate(groupParams), photoController.listPhotos);
router.post('/:groupId/photos', validate(addPhotoSchema), photoController.addPhoto);

router.get('/:groupId/attractions', validate(groupParams), attractionController.listAttractions);
router.post('/:groupId/attractions', validate(createAttractionSchema), attractionController.createAttraction);

router.get('/:groupId/stays', validate(groupParams), stayController.listStays);
router.post('/:groupId/stays', validate(createStaySchema), stayController.createStay);

module.exports = router;
