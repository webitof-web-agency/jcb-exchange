'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Clock, Loader2, BookOpen } from 'lucide-react';
import api, { getRemoteMediaUrl } from '@/lib/api';
import type { PublicBlogPost } from './BlogPageClient';
import { extractBlogFaq, removeBlogFaqSection } from '@/lib/blogFaq';
import BlogQuestions from './BlogQuestions';

function estimateReadTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

type BlogHeading = {
  id: string;
  label: string;
  level: 1 | 2 | 3 | 4;
};

const decodeHeadingText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

const createHeadingId = (label: string, index: number, usedIds: Set<string>) => {
  const baseId = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `section-${index + 1}`;

  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
};

const prepareBlogContent = (html: string) => {
  const headings: BlogHeading[] = [];
  const usedIds = new Set<string>();

  // 1. Primary: Extract genuine h1, h2, h3, h4 headings (concise titles only <= 100 chars)
  let contentWithHeadingIds = html.replace(
    /<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (match, rawLevel: string, attributes: string, innerHtml: string) => {
      const level = Number(rawLevel) as 1 | 2 | 3 | 4;
      const label = decodeHeadingText(innerHtml);

      // Only include concise heading titles (excludes long paragraph blocks accidentally wrapped in h tags)
      if (label && label.length > 0 && label.length <= 100) {
        const id = createHeadingId(label, headings.length, usedIds);
        headings.push({ id, label, level });
        return `<h${level}${attributes} id="${id}">${innerHtml}</h${level}>`;
      }

      return match;
    },
  );

  // 2. Fallback: If no h1-h4 tags present in the content, extract short numbered list items / strong titles (<= 80 chars)
  if (headings.length === 0) {
    contentWithHeadingIds = contentWithHeadingIds.replace(
      /<ol>([\s\S]*?)<\/ol>/gi,
      (match, listContent) => {
        return listContent.replace(
          /<li>([\s\S]*?)<\/li>/gi,
          (liMatch: string, liInnerHtml: string) => {
            const label = decodeHeadingText(liInnerHtml);
            if (label && label.length > 0 && label.length <= 90) {
              const id = createHeadingId(label, headings.length, usedIds);
              headings.push({ id, label: `${headings.length + 1}. ${label}`, level: 2 });
              return `<li id="${id}">${liInnerHtml}</li>`;
            }
            return liMatch;
          }
        );
      }
    );
  }

  // Absolute image URLs
  const htmlWithAbsoluteImages = contentWithHeadingIds.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, source, suffix) => {
      const absoluteUrl = getRemoteMediaUrl(source);
      return absoluteUrl ? `${prefix}${absoluteUrl}${suffix}` : match;
    },
  );

  return { html: htmlWithAbsoluteImages, headings };
};

export default function BlogArticleClient({ slug }: { slug: string }) {
  const [post, setPost] = useState<PublicBlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const faqItems = useMemo(() => (post ? extractBlogFaq(post.contentHtml) : []), [post]);
  const preparedContent = useMemo(
    () => {
      if (!post) return { html: '', headings: [] as BlogHeading[] };
      return prepareBlogContent(removeBlogFaqSection(post.contentHtml));
    },
    [post],
  );

  useEffect(() => {
    let cancelled = false;
    api.get<{ data: PublicBlogPost }>(`/blogs/${encodeURIComponent(slug)}`)
      .then((response) => { if (!cancelled) setPost(response.data.data); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFC107]" />
          <p className="text-sm text-gray-400">Loading article...</p>
        </div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <BookOpen className="h-9 w-9 text-gray-300" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Article not found</h1>
        <p className="mt-2 text-gray-500">This article may have been unpublished or moved.</p>
        <Link href="/blog" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-5 py-2.5 text-sm font-bold text-gray-950 transition hover:bg-[#e6ad00]">
          <ArrowLeft className="h-4 w-4" /> Back to Blog
        </Link>
      </div>
    );
  }

  const imageUrl = getRemoteMediaUrl(post.coverImageUrl);
  const publishedDate = post.publishedAt || post.createdAt;
  const readTime = estimateReadTime(post.contentHtml);
  const tableOfContents: BlogHeading[] = faqItems.length > 0
    ? [...preparedContent.headings, { id: 'frequently-asked-questions', label: 'Frequently Asked Questions', level: 2 }, { id: 'community-questions', label: 'Community Q&A', level: 2 }]
    : [...preparedContent.headings, { id: 'community-questions', label: 'Community Q&A', level: 2 }];
  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(publishedDate));

  return (
    <article className="min-h-screen bg-white">

      {/* ── Breadcrumb ── */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-[#a87500]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        </div>
      </div>

      {/* ── Article header ── */}
      <header className="mx-auto max-w-7xl px-4 pt-10 pb-6 sm:px-6 lg:px-8">
        {/* Meta */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[#FFC107]" />
            {formattedDate}
          </span>
          <span className="h-1 w-1 rounded-full bg-gray-300" />
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-[#FFC107]" />
            {readTime} min read
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="mt-4 text-lg leading-8 text-gray-500">
            {post.excerpt}
          </p>
        )}

        {/* Divider */}
        <div className="mt-8 h-px w-full bg-gradient-to-r from-[#FFC107]/40 via-gray-200 to-transparent" />
      </header>

      {/* ── Cover image ── */}
      {imageUrl && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm">
            <img
              src={imageUrl}
              alt={post.title}
              className="w-full object-cover"
              style={{ maxHeight: '520px' }}
            />
          </div>
        </div>
      )}

      {/* ── Article body with Sticky Heading TOC ── */}
      <div className={`mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 ${tableOfContents.length ? 'lg:grid lg:grid-cols-12 lg:items-start lg:gap-10' : ''}`}>
        
        {/* ── Sticky Table of Contents (Headings Only) ── */}
        {tableOfContents.length > 0 && (
          <aside className="order-2 hidden lg:order-1 lg:col-span-3 lg:block lg:self-start lg:sticky lg:top-24">
            <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-gray-200/80 bg-gray-50/90 p-5 shadow-sm backdrop-blur-xs">
              <div className="flex items-center gap-2 border-b border-gray-200/80 pb-3">
                <BookOpen className="h-4 w-4 text-[#a87500]" />
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a87500]">
                  In this article
                </p>
              </div>
              <nav aria-label="Article headings table of contents" className="mt-3 space-y-1">
                {tableOfContents.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className={`group flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm leading-5 text-gray-600 transition hover:bg-white hover:text-[#a87500] hover:shadow-2xs ${
                      heading.level === 3 ? 'pl-5 text-xs' : heading.level === 4 ? 'pl-7 text-xs' : 'font-semibold text-gray-800'
                    }`}
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300 transition group-hover:bg-[#FFC107]" />
                    <span className="line-clamp-2">{heading.label}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* ── Article content ── */}
        <div className={tableOfContents.length ? 'order-1 lg:order-2 lg:col-span-9' : 'w-full'}>
          <div
            className="blog-content"
            dangerouslySetInnerHTML={{ __html: preparedContent.html }}
          />

          {faqItems.length > 0 && (
            <section id="frequently-asked-questions" className="blog-faq mt-14 scroll-mt-24 border-t border-gray-200 pt-10">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a87500]">Questions &amp; answers</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                  Frequently Asked Questions
                </h2>
                <p className="mt-3 text-base leading-7 text-gray-500">
                  Clear answers to common questions about this machine, inspection process, and application.
                </p>
              </div>

              <div className="mt-7 space-y-3">
                {faqItems.map((item, index) => (
                  <details key={`${item.question}-${index}`} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition open:border-[#FFC107]/60 open:shadow-md">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-left text-base font-bold text-gray-900 transition hover:bg-[#fffdf0] sm:px-6">
                      <span>{item.question}</span>
                      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff8dc] text-xl font-normal leading-none text-[#a87500] transition group-open:rotate-45">+</span>
                    </summary>
                    <div className="border-t border-gray-100 px-5 pb-5 pt-4 sm:px-6">
                      <div className="blog-content text-[0.98rem]" dangerouslySetInnerHTML={{ __html: item.answerHtml }} />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          <BlogQuestions slug={slug} />
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Enjoyed this article?</p>
              <p className="text-sm text-gray-500">Explore more insights from JCB Exchange.</p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800"
            >
              <ArrowLeft className="h-4 w-4" />
              All Articles
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
