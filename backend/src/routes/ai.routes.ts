import { Router } from 'express';
import {
  chatWithAi,
  createAiConversation,
  getAiBriefing,
  getAiConversationMessages,
  getAiConversations,
  getAiStatus,
  getAiTools,
  updateAiConversation,
} from '../controllers/ai.controller';
import {
  createControlledActionSuggestion,
  executeControlledAction,
  getControlledActionCatalog,
  getControlledActionProposals,
  reviewControlledAction,
} from '../controllers/aiAutomation.controller';
import { requireAiAccess } from '../middlewares/aiAccess.middleware';
import { requireAuth } from '../middlewares/auth.middleware';
import { aiChatRateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(requireAuth, requireAiAccess);
router.get('/status', getAiStatus);
router.get('/tools', getAiTools);
router.get('/briefing', getAiBriefing);
router.get('/history', getAiConversations);
router.post('/history', createAiConversation);
router.get('/history/:conversationId/messages', getAiConversationMessages);
router.patch('/history/:conversationId', updateAiConversation);
router.post('/chat', aiChatRateLimit, chatWithAi);
router.get('/actions/catalog', getControlledActionCatalog);
router.get('/actions/proposals', getControlledActionProposals);
router.post('/actions/proposals', createControlledActionSuggestion);
router.post('/actions/proposals/:id/review', reviewControlledAction);
router.post('/actions/proposals/:id/execute', executeControlledAction);

export default router;
