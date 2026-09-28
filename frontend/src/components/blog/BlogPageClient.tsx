'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, Clock, Loader2 } from 'lucide-react';
import api, { getRemoteMediaUrl } from '@/lib/api';

export type PublicBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
    : '';

function estimateReadTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function BlogPageClient() {
  const [posts, setPosts] = useState<PublicBlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ data: PublicBlogPost[] }>('/blogs')
      .then((response) => { if (!cancelled) setPosts(response.data.data || []); })
      .catch(() => { if (!cancelled) setPosts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50/50">

      {/* ── Compact Hero Banner ── */}
      <section className="relative overflow-hidden border-b border-gray-100 bg-[#0f172a] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#FFC107]/10 blur-3xl" />
          <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl">
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFC107]/25 bg-[#FFC107]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#FFC107]">
            <BookOpen className="h-3 w-3" />
            JCB Exchange Blog
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Ideas, guides &amp; machine stories.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Practical insights for buying, selling, maintaining, and growing with heavy equipment.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex min-h-60 items-center justify-center gap-2.5 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin text-[#FFC107]" />
            Loading articles…
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && posts.length === 0 && (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-xs">
            <BookOpen className="mx-auto h-10 w-10 text-gray-300" />
            <h2 className="mt-4 text-lg font-bold text-gray-900">No articles published yet</h2>
            <p className="mt-1 text-sm text-gray-500">New insights from JCB Exchange will appear here.</p>
          </div>
        )}

        {/* ── 3-Card Grid Row Layout ── */}
        {!loading && posts.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => {
              const imageUrl = getRemoteMediaUrl(post.coverImageUrl);
              return (
                <article
                  key={post.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs transition duration-300 hover:-translate-y-1 hover:border-[#FFC107]/50 hover:shadow-xl"
                >
                  <Link href={`/blog/${post.slug}`} className="flex flex-1 flex-col">
                    {/* Cover image */}
                    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={post.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <BookOpen className="h-10 w-10 text-slate-300" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-3 flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 text-[#FFC107]" />
                          {formatDate(post.publishedAt || post.createdAt)}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-gray-200" />
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#FFC107]" />
                          {estimateReadTime(post.contentHtml)} min read
                        </span>
                      </div>

                      <h2 className="line-clamp-2 text-lg font-bold leading-snug text-gray-900 transition group-hover:text-[#a87500]">
                        {post.title}
                      </h2>

                      {post.excerpt && (
                        <p className="mt-2.5 line-clamp-3 text-sm leading-6 text-gray-500">
                          {post.excerpt}
                        </p>
                      )}

                      <div className="mt-auto pt-5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#a87500]">
                          Read article
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
