import { Router } from 'express';
import {
  chatWithAi,
  createAiConversation,
  deleteAiConversation,
  deleteAllAiConversations,
  getAiBriefing,
  getAiConversationMessages,
  getAiConversations,
  getAiStatus,
  getAiTools,
  getAiObservability,
  getAiSync,
  getAiModels,
  updateAiConversation,
  postAiFeedback,
  getAiMemory,
  deleteAiMemory,
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
router.get('/models', getAiModels);
router.get('/tools', getAiTools);
router.get('/observability', getAiObservability);
router.get('/sync', getAiSync);
router.get('/briefing', getAiBriefing);
router.get('/history', getAiConversations);
router.post('/history', createAiConversation);
router.delete('/history', deleteAllAiConversations);
router.get('/history/:conversationId/messages', getAiConversationMessages);
router.patch('/history/:conversationId', updateAiConversation);
router.delete('/history/:conversationId', deleteAiConversation);
router.post('/chat', aiChatRateLimit, chatWithAi);
router.post('/feedback', postAiFeedback);
router.get('/memory', getAiMemory);
router.delete('/memory/:id', deleteAiMemory);
router.get('/actions/catalog', getControlledActionCatalog);
router.get('/actions/proposals', getControlledActionProposals);
router.post('/actions/proposals', createControlledActionSuggestion);
router.post('/actions/proposals/:id/review', reviewControlledAction);
router.post('/actions/proposals/:id/execute', executeControlledAction);

export default router;
