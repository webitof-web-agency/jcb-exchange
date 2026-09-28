import type { NextFunction, Request, Response } from 'express';
import { BlogQuestionStatus } from '@prisma/client';
import {
  createPendingBlogQuestion,
  deleteBlogQuestion,
  findBlogQuestion,
  findPublishedBlogForQuestions,
  findRecentDuplicateQuestion,
  listAdminBlogQuestions,
  listApprovedBlogQuestions,
  updateBlogQuestionModeration,
} from '../services/blogQuestion.service';

const MAX_QUESTION_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 5000;

const normalizeQuestion = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeAnswer = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const getSlug = (req: Request) => String(req.params.slug || '').trim().toLowerCase();
const getBlogId = (req: Request) => String(req.params.id || '').trim();

const isQuestionStatus = (value: unknown): value is BlogQuestionStatus =>
  value === BlogQuestionStatus.PENDING ||
  value === BlogQuestionStatus.APPROVED ||
  value === BlogQuestionStatus.REJECTED;

export const getPublicBlogQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blog = await findPublishedBlogForQuestions(getSlug(req));
    if (!blog) return res.status(404).json({ error: 'Blog post not found.' });

    const questions = await listApprovedBlogQuestions(blog.id);
    return res.json({ data: questions });
  } catch (error) {
    return next(error);
  }
};

export const submitPublicBlogQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Please sign in to ask a question.' });

    const question = normalizeQuestion(req.body?.question);
    if (question.length < 10 || question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({ error: `Question must be between 10 and ${MAX_QUESTION_LENGTH} characters.` });
    }

    const blog = await findPublishedBlogForQuestions(getSlug(req));
    if (!blog) return res.status(404).json({ error: 'Blog post not found.' });

    const duplicate = await findRecentDuplicateQuestion({
      blogPostId: blog.id,
      askedById: userId,
      question,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    if (duplicate) return res.status(409).json({ error: 'You already submitted this question recently.' });

    const created = await createPendingBlogQuestion({ blogPostId: blog.id, askedById: userId, question });
    return res.status(201).json({
      data: created,
      message: 'Your question was submitted and is waiting for review.',
    });
  } catch (error) {
    return next(error);
  }
};

export const getAdminBlogQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questions = await listAdminBlogQuestions(getBlogId(req));
    return res.json({ data: questions });
  } catch (error) {
    return next(error);
  }
};

export const moderateAdminBlogQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blogPostId = getBlogId(req);
    const questionId = String(req.params.questionId || '').trim();
    const status = req.body?.status;
    const answer = normalizeAnswer(req.body?.answer);

    if (!questionId || !isQuestionStatus(status)) {
      return res.status(400).json({ error: 'A valid question status is required.' });
    }
    if (answer && answer.length > MAX_ANSWER_LENGTH) {
      return res.status(400).json({ error: `Answer must be ${MAX_ANSWER_LENGTH} characters or fewer.` });
    }
    if (status === BlogQuestionStatus.APPROVED && (!answer || answer.length < 2)) {
      return res.status(400).json({ error: 'An answer is required before approving a question.' });
    }

    const question = await findBlogQuestion(blogPostId, questionId);
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    const isApproved = status === BlogQuestionStatus.APPROVED;
    const updated = await updateBlogQuestionModeration({
      questionId,
      status,
      answer,
      answeredById: isApproved ? req.user?.id || null : null,
      answeredAt: isApproved ? new Date() : null,
    });
    return res.json({ data: updated });
  } catch (error) {
    return next(error);
  }
};

export const deleteAdminBlogQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const question = await findBlogQuestion(getBlogId(req), String(req.params.questionId || '').trim());
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    await deleteBlogQuestion(question.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};
