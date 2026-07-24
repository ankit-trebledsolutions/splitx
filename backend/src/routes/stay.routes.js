const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/stay.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const stayParams = { params: z.object({ stayId: objectId }) };

const updateStaySchema = {
  params: z.object({ stayId: objectId }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    stars: z.number().int().min(1).max(5).optional(),
    status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),
    guests: z.number().int().min(1).max(50).optional(),
    pricePerNight: z.number().nonnegative().optional(),
    amenities: z.array(z.string().max(40)).max(12).optional(),
    address: z.string().max(200).optional(),
    emoji: z.string().max(8).optional(),
  }),
};

router.patch('/:stayId', validate(updateStaySchema), controller.updateStay);
router.delete('/:stayId', validate(stayParams), controller.deleteStay);

module.exports = router;
