const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { photoUpload, chatUpload, videoUpload } = require('../middleware/upload');
const aiLimiter = require('../middleware/aiLimiter');
const placesLimiter = require('../middleware/placesLimiter');
const faceScanLimiter = require('../middleware/faceScanLimiter');
const { TIME_12H } = require('../utils/itineraryTime');
const groupController = require('../controllers/group.controller');
const expenseController = require('../controllers/expense.controller');
const messageController = require('../controllers/message.controller');
const taskController = require('../controllers/task.controller');
const reminderController = require('../controllers/reminder.controller');
const itineraryController = require('../controllers/itinerary.controller');
const photoController = require('../controllers/photo.controller');
const attractionController = require('../controllers/attraction.controller');
const stayController = require('../controllers/stay.controller');
const placeController = require('../controllers/place.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// A trip's destination as picked from the country and state lists (GET
// /places/countries). The codes are checked against the lists by the service;
// `location` is the typed text older app builds send instead.
const pickedDestination = z.object({
  countryCode: z.string().trim().length(2, 'Pick a country'),
  stateCode: z.string().trim().max(24).optional(),
});

const createGroupSchema = {
  body: z.object({
    name: z.string().min(2, 'Group name must be at least 2 characters').max(80),
    description: z.string().max(300).optional(),
    groupType: z.enum(['trip', 'home', 'couple', 'event', 'other']).default('trip'),
    totalDays: z.number().int().min(1).max(365).optional(),
    startDate: z.coerce.date().optional(),
    location: z.string().max(120).optional(),
    destination: pickedDestination.optional(),
  }),
};

const joinGroupSchema = {
  body: z.object({
    inviteCode: z.string().min(4, 'Invite code is required').max(16),
  }),
};

// The code from an invite link (https://<host>/join/<code>), as typed or tapped.
const invitePreviewSchema = {
  params: z.object({ code: z.string().trim().min(4, 'Invite code is required').max(16) }),
};

const groupParams = { params: z.object({ groupId: objectId }) };

const leaveGroupSchema = {
  params: z.object({ groupId: objectId }),
  // Only needed when the admin leaves a group of three or more.
  body: z.object({ newAdminId: objectId.optional() }).optional(),
};

const removeMemberSchema = { params: z.object({ groupId: objectId, memberId: objectId }) };

const muteGroupSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({ muted: z.boolean() }),
};

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
  body: z.object({
    text: z.string().min(1, 'Message cannot be empty').max(2000),
    replyTo: objectId.optional(),
  }),
};

const messageParams = { params: z.object({ groupId: objectId, messageId: objectId }) };

const createTaskSchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    title: z.string().min(1, 'Task title is required').max(200),
    notes: z.string().max(500).optional(),
    priority: z.enum(['high', 'med', 'low']).default('med'),
    assignees: z.array(objectId).optional(),
    dueAt: z.coerce.date().nullish(),
    subtasks: z
      .array(z.object({ title: z.string().min(1).max(200), done: z.boolean().default(false) }))
      .max(20)
      .optional(),
    links: z
      .array(z.object({ title: z.string().max(120).optional(), url: z.string().max(500) }))
      .max(10)
      .optional(),
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
    repeatWeekly: z.boolean().optional(),
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
          endTime: z.string().max(20).optional(),
          title: z.string().min(1).max(200),
          location: z.string().max(200).optional(),
          icon: z.string().max(40).optional(),
          note: z.string().max(300).optional(),
        })
      )
      .optional(),
  }),
};

// The AI planner's form. Every choice is an enum and the one free-text field is
// short, which keeps what reaches the prompt small and predictable.
// destination, startDate and days are only used where the group has no value
// of its own (see resolveTrip in aiItinerary.service).
const generateItinerarySchema = {
  params: z.object({ groupId: objectId }),
  body: z.object({
    destination: z.string().trim().min(2).max(120).optional(),
    startDate: z.coerce.date().nullish(),
    days: z.number().int().min(1).max(14).optional(),
    // Large groups are welcome; the server plans for at most 50 people.
    groupSize: z.number().int().min(1).max(1000).optional(),
    travellers: z.enum(['friends', 'couple', 'family_kids', 'with_elders', 'solo']),
    interests: z
      .array(
        z.enum([
          'sightseeing',
          'food',
          'nature',
          'adventure',
          'shopping',
          'nightlife',
          'spiritual',
          'history',
          'relaxing',
        ])
      )
      .min(1)
      .max(9),
    pace: z.enum(['relaxed', 'balanced', 'packed']),
    budget: z.enum(['budget', 'mid', 'premium']),
    transport: z.enum(['own_car', 'cab', 'public_transport', 'walking']),
    arrivalTime: z.string().regex(TIME_12H, 'Arrival time must look like 9:30 AM').nullish(),
    departureTime: z.string().regex(TIME_12H, 'Departure time must look like 9:30 AM').nullish(),
    food: z.enum(['vegetarian', 'non_veg', 'vegan', 'jain']).nullish(),
    notes: z.string().trim().max(300).optional().default(''),
    dayStart: z.enum(['early', 'normal', 'late']).optional().default('normal'),
    accessibility: z.enum(['none', 'limited_walking', 'wheelchair']).optional().default('none'),
    replace: z.boolean().optional().default(false),
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
    // Set when it was picked from the suggestions: the provider's id, so the
    // same place is not offered again. Free text otherwise sends nothing.
    placeId: z.string().max(255).optional(),
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
    placeId: z.string().max(255).optional(),
  }),
};

// Suggested hotels / sights at the trip's destination (see
// services/placeSuggestion.service.js). `refresh=1` asks the provider again
// when the cached copy is older than ten minutes; it counts towards the caps.
const placeSuggestionsSchema = {
  params: z.object({ groupId: objectId, type: z.enum(['stay', 'attraction']) }),
  query: z.object({ refresh: z.enum(['0', '1']).optional() }),
};

// The trip's destination, set or changed after creation. Admin only.
const destinationSchema = {
  params: groupParams.params,
  body: z
    .object({
      location: z.string().trim().min(2, 'Add a destination').max(120).optional(),
      destination: pickedDestination.optional(),
    })
    .refine((body) => body.location || body.destination, { message: 'Add a destination' }),
};

// The name search on the Stays and Attractions tabs, within the trip's destination.
const placeSearchSchema = {
  params: groupParams.params,
  query: z.object({
    type: z.enum(['stay', 'attraction']),
    q: z.string().trim().min(1, 'Type a name to search for').max(60),
  }),
};

router.post('/', validate(createGroupSchema), groupController.createGroup);
router.get('/', groupController.listGroups);
router.post('/join', validate(joinGroupSchema), groupController.joinGroup);
// Ahead of /:groupId so "invites" is never read as a group id.
router.get('/invites/:code', validate(invitePreviewSchema), groupController.previewInvite);
router.get('/:groupId', validate(groupParams), groupController.getGroup);
router.delete('/:groupId', validate(groupParams), groupController.deleteGroup);
router.post('/:groupId/leave', validate(leaveGroupSchema), groupController.leaveGroup);
router.delete('/:groupId/members/:memberId', validate(removeMemberSchema), groupController.removeMember);
router.put('/:groupId/mute', validate(muteGroupSchema), groupController.setMuted);
router.get('/:groupId/balances', validate(groupParams), groupController.getBalances);
router.get('/:groupId/contributions', validate(groupParams), groupController.getContributions);

router.post('/:groupId/expenses', validate(createExpenseSchema), expenseController.createExpense);
router.get('/:groupId/expenses', validate(groupParams), expenseController.listExpenses);

router.get('/:groupId/messages', validate(groupParams), messageController.listMessages);
router.post('/:groupId/messages', validate(sendMessageSchema), messageController.sendMessage);
router.post(
  '/:groupId/messages/upload',
  validate(groupParams),
  chatUpload.single('file'),
  messageController.sendAttachment
);
router.delete('/:groupId/messages/:messageId', validate(messageParams), messageController.deleteMessage);

router.get('/:groupId/tasks', validate(groupParams), taskController.listTasks);
router.post('/:groupId/tasks', validate(createTaskSchema), taskController.createTask);

router.get('/:groupId/reminders', validate(groupParams), reminderController.listReminders);
router.post('/:groupId/reminders', validate(createReminderSchema), reminderController.createReminder);

router.get('/:groupId/itinerary', validate(groupParams), itineraryController.listDays);
router.post('/:groupId/itinerary', validate(createItineraryDaySchema), itineraryController.createDay);
router.get('/:groupId/itinerary/generate', validate(groupParams), itineraryController.getGeneration);
router.post(
  '/:groupId/itinerary/generate',
  aiLimiter,
  validate(generateItinerarySchema),
  itineraryController.startGeneration
);

router.get('/:groupId/photos', validate(groupParams), photoController.listPhotos);
router.post('/:groupId/photos', validate(addPhotoSchema), photoController.addPhoto);
router.post(
  '/:groupId/photos/upload',
  validate(groupParams),
  photoUpload.single('photo'),
  photoController.uploadPhoto
);
router.post(
  '/:groupId/videos/upload',
  validate(groupParams),
  videoUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
  ]),
  photoController.uploadVideo
);
// Face Scan: the picture to look for (same field and limits as a photo
// upload, but it is not stored), and how many photos still wait to be scanned.
router.post(
  '/:groupId/face-scan',
  faceScanLimiter,
  validate(groupParams),
  photoUpload.single('photo'),
  photoController.faceScan
);
router.get('/:groupId/face-scan', validate(groupParams), photoController.faceScanStatus);

router.get('/:groupId/attractions', validate(groupParams), attractionController.listAttractions);
router.post('/:groupId/attractions', validate(createAttractionSchema), attractionController.createAttraction);

router.get('/:groupId/suggestions/:type', placesLimiter, validate(placeSuggestionsSchema), placeController.suggestions);
router.get('/:groupId/places/search', placesLimiter.search, validate(placeSearchSchema), placeController.search);
router.patch('/:groupId/destination', validate(destinationSchema), groupController.setDestination);

router.get('/:groupId/stays', validate(groupParams), stayController.listStays);
router.post('/:groupId/stays', validate(createStaySchema), stayController.createStay);

module.exports = router;
