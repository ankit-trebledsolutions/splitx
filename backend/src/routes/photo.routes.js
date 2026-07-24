const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/photo.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const photoParams = { params: z.object({ photoId: objectId }) };

router.delete('/:photoId', validate(photoParams), controller.deletePhoto);

module.exports = router;
