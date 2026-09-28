import { Router } from 'express';
import { getPublishedBlogBySlug, listPublishedBlogs } from '../controllers/blog.controller';
import { getPublicBlogQuestions, submitPublicBlogQuestion } from '../controllers/blogQuestion.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { blogQuestionRateLimit } from '../utils/blogQuestionRateLimit';

const router = Router();

router.get('/', listPublishedBlogs);
router.get('/:slug/questions', getPublicBlogQuestions);
router.post('/:slug/questions', requireAuth, blogQuestionRateLimit, submitPublicBlogQuestion);
router.get('/:slug', getPublishedBlogBySlug);

export default router;
