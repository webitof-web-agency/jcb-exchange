import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { normalizeBlogSlug, sanitizeBlogHtml } from '../utils/blogContent';

const MAX_TITLE_LENGTH = 180;
const MAX_EXCERPT_LENGTH = 500;

const asOptionalString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const asCoverImageUrl = (value: unknown) => {
  const coverImageUrl = asOptionalString(value);
  if (!coverImageUrl) return null;

  if (!/^\/uploads\/public\/blog-cover\//i.test(coverImageUrl) && !/^https?:\/\//i.test(coverImageUrl)) {
    throw new Error('The cover image must be a valid public image URL.');
  }

  return coverImageUrl.slice(0, 1000);
};

const parseBlogPayload = (body: Record<string, unknown>, current?: { title: string; slug: string; excerpt: string | null; contentHtml: string; coverImageUrl: string | null; isPublished: boolean }) => {
  const title = String(body.title ?? current?.title ?? '').trim();
  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Blog title is required and must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }

  // Slugs are generated from the title for new posts. Existing slugs are
  // intentionally preserved on edit so published URLs remain stable.
  const slug = normalizeBlogSlug(String(current?.slug ?? title));
  const contentHtml = sanitizeBlogHtml(String(body.contentHtml ?? current?.contentHtml ?? ''));
  const excerpt = asOptionalString(body.excerpt ?? current?.excerpt);
  if (excerpt && excerpt.length > MAX_EXCERPT_LENGTH) {
    throw new Error(`Blog excerpt must be ${MAX_EXCERPT_LENGTH} characters or fewer.`);
  }

  const isPublished = body.isPublished === undefined
    ? Boolean(current?.isPublished)
    : body.isPublished === true || body.isPublished === 'true';

  return {
    title,
    slug,
    excerpt,
    contentHtml,
    coverImageUrl: asCoverImageUrl(body.coverImageUrl ?? current?.coverImageUrl),
    isPublished,
  };
};

const getUniqueBlogSlug = async (baseSlug: string) => {
  const normalizedBase = normalizeBlogSlug(baseSlug);
  let candidate = normalizedBase;
  let suffix = 2;

  while (await prisma.blogPost.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    const suffixText = `-${suffix}`;
    candidate = `${normalizedBase.slice(0, 120 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  return candidate;
};

const serializeBlogPost = (post: any) => ({
  id: post.id,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  contentHtml: sanitizeBlogHtml(post.contentHtml),
  coverImageUrl: post.coverImageUrl,
  isPublished: post.isPublished,
  publishedAt: post.publishedAt,
  createdById: post.createdById,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
});

export const listPublishedBlogs = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: {
        isPublished: true,
        publishedAt: { lte: new Date() },
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return res.json({ data: posts.map(serializeBlogPost) });
  } catch (error) {
    return next(error);
  }
};

export const getPublishedBlogBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true,
        publishedAt: { lte: new Date() },
      },
    });

    if (!post) return res.status(404).json({ error: 'Blog post not found.' });
    return res.json({ data: serializeBlogPost(post) });
  } catch (error) {
    return next(error);
  }
};

export const listAdminBlogs = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: { updatedAt: 'desc' } });
    return res.json({ data: posts.map(serializeBlogPost) });
  } catch (error) {
    return next(error);
  }
};

export const createAdminBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = parseBlogPayload(req.body || {});
    const slug = await getUniqueBlogSlug(payload.slug);
    const post = await prisma.blogPost.create({
      data: {
        ...payload,
        slug,
        publishedAt: payload.isPublished ? new Date() : null,
        createdById: req.user?.id || null,
      },
    });
    return res.status(201).json({ data: serializeBlogPost(post) });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'A blog post with this slug already exists.' });
    if (error instanceof Error && /^(Blog title|Blog slug|Blog content|Blog excerpt|The cover image)/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
};

export const updateAdminBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: String(req.params.id || '') } });
    if (!existing) return res.status(404).json({ error: 'Blog post not found.' });

    const payload = parseBlogPayload(req.body || {}, existing);
    const post = await prisma.blogPost.update({
      where: { id: existing.id },
      data: {
        ...payload,
        publishedAt: payload.isPublished ? (existing.publishedAt || new Date()) : null,
      },
    });
    return res.json({ data: serializeBlogPost(post) });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'A blog post with this slug already exists.' });
    if (error instanceof Error && /^(Blog title|Blog slug|Blog content|Blog excerpt|The cover image)/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
};

export const deleteAdminBlog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: String(req.params.id || '') } });
    if (!existing) return res.status(404).json({ error: 'Blog post not found.' });
    await prisma.blogPost.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};
