import prisma from '../lib/prisma';
import { BlogQuestionStatus } from '@prisma/client';

const publicQuestionSelect = {
  id: true,
  question: true,
  answer: true,
  answeredAt: true,
  createdAt: true,
} as const;

export const findPublishedBlogForQuestions = (slug: string) => prisma.blogPost.findFirst({
  where: {
    slug,
    isPublished: true,
    publishedAt: { lte: new Date() },
  },
  select: { id: true },
});

export const listApprovedBlogQuestions = (blogPostId: string) => prisma.blogQuestion.findMany({
  where: {
    blogPostId,
    status: BlogQuestionStatus.APPROVED,
    answer: { not: null },
  },
  select: publicQuestionSelect,
  orderBy: [{ answeredAt: 'desc' }, { createdAt: 'desc' }],
  take: 50,
});

export const createPendingBlogQuestion = (data: {
  blogPostId: string;
  askedById: string;
  question: string;
}) => prisma.blogQuestion.create({
  data: {
    blogPostId: data.blogPostId,
    askedById: data.askedById,
    question: data.question,
  },
  select: {
    id: true,
    status: true,
    createdAt: true,
  },
});

export const findRecentDuplicateQuestion = (data: {
  blogPostId: string;
  askedById: string;
  question: string;
  since: Date;
}) => prisma.blogQuestion.findFirst({
  where: {
    blogPostId: data.blogPostId,
    askedById: data.askedById,
    question: data.question,
    createdAt: { gte: data.since },
  },
  select: { id: true },
});

export const listAdminBlogQuestions = (blogPostId: string) => prisma.blogQuestion.findMany({
  where: { blogPostId },
  orderBy: { createdAt: 'desc' },
  include: {
    askedBy: { select: { id: true, name: true, email: true, mobile: true } },
    answeredBy: { select: { id: true, name: true } },
  },
});

export const findBlogQuestion = (blogPostId: string, questionId: string) => prisma.blogQuestion.findFirst({
  where: { id: questionId, blogPostId },
  select: { id: true },
});

export const updateBlogQuestionModeration = (data: {
  questionId: string;
  status: BlogQuestionStatus;
  answer: string | null;
  answeredById: string | null;
  answeredAt: Date | null;
}) => prisma.blogQuestion.update({
  where: { id: data.questionId },
  data: {
    status: data.status,
    answer: data.answer,
    answeredById: data.answeredById,
    answeredAt: data.answeredAt,
  },
  include: {
    askedBy: { select: { id: true, name: true, email: true, mobile: true } },
    answeredBy: { select: { id: true, name: true } },
  },
});

export const deleteBlogQuestion = (questionId: string) => prisma.blogQuestion.delete({
  where: { id: questionId },
});
