import type { Metadata } from 'next';
import BlogArticleClient from '@/components/blog/BlogArticleClient';
import { extractBlogFaq, faqAnswerToPlainText } from '@/lib/blogFaq';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://jcbexchange.com';

const toAbsoluteImageUrl = (value: string | null | undefined) => {
  if (!value) return undefined;
  return value.startsWith('http') ? value : `${SITE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
};

const fetchBlog = async (slug: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/blogs/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: {
      title: string;
      excerpt: string | null;
      contentHtml: string;
      coverImageUrl: string | null;
      publishedAt: string | null;
      createdAt: string;
      updatedAt?: string;
    } };
    return payload.data || null;
  } catch {
    return null;
  }
};

const defaultMetadata: Metadata = {
  title: 'JCB Exchange Blog Article',
  description: 'Read the latest heavy machinery insights from JCB Exchange.',
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const blog = await fetchBlog(slug);
  const imageUrl = toAbsoluteImageUrl(blog?.coverImageUrl);
  return blog ? {
    title: `${blog.title} | JCB Exchange Blog`,
    description: blog.excerpt || `Read ${blog.title} on the JCB Exchange Blog.`,
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/blog/${slug}`,
      title: blog.title,
      description: blog.excerpt || `Read ${blog.title} on the JCB Exchange Blog.`,
      ...(imageUrl ? { images: [{ url: imageUrl, alt: blog.title }] } : {}),
      publishedTime: blog.publishedAt || blog.createdAt,
      modifiedTime: blog.updatedAt,
    },
  } : defaultMetadata;
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blog = await fetchBlog(slug);
  const imageUrl = toAbsoluteImageUrl(blog?.coverImageUrl);
  const articleSchema = blog ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: blog.title,
    description: blog.excerpt || undefined,
    url: `${SITE_URL}/blog/${slug}`,
    datePublished: blog.publishedAt || blog.createdAt,
    dateModified: blog.updatedAt || blog.publishedAt || blog.createdAt,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    publisher: { '@type': 'Organization', name: 'JCB Exchange', url: SITE_URL },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${slug}` },
  } : null;
  const faqItems = blog ? extractBlogFaq(blog.contentHtml) : [];
  const faqSchema = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faqAnswerToPlainText(item.answerHtml),
      },
    })),
  } : null;

  return <>
    {articleSchema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c') }} /> : null}
    {faqSchema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} /> : null}
    <BlogArticleClient slug={slug} />
  </>;
}
