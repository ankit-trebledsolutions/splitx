const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/photo.controller');

const router = Router();
router.use(protect);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const photoParams = { params: z.object({ photoId: objectId }) };

const bulkDeleteSchema = {
  body: z.object({ photoIds: z.array(objectId).min(1, 'Pick at least one photo').max(100) }),
};

router.post('/bulk-delete', validate(bulkDeleteSchema), controller.deletePhotos);
router.delete('/:photoId', validate(photoParams), controller.deletePhoto);

module.exports = router;
