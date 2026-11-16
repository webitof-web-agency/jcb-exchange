import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { listingCompletionRateLimit } from '../middlewares/rateLimit.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';
import {
  createCompletionInvite,
  getActiveCompletionInvite,
  getCompletionInvite,
  revokeCompletionInvite,
  submitCompletion,
  uploadCompletionMedia,
} from '../controllers/listingCompletionInvite.controller';

const router = Router();
const upload = getDocumentUploadMiddleware('public', 'listing-media');

router.get('/:token', listingCompletionRateLimit, getCompletionInvite);
router.post('/:token/media', listingCompletionRateLimit, upload.single('file'), uploadCompletionMedia);
router.put('/:token', listingCompletionRateLimit, submitCompletion);

export default router;
