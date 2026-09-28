import type { Metadata } from 'next';
import BlogPageClient from '@/components/blog/BlogPageClient';

export const metadata: Metadata = {
  title: 'JCB Exchange Blog | Heavy Machinery Insights',
  description: 'Read practical heavy machinery buying guides, maintenance insights, and marketplace stories from JCB Exchange.',
};

export default function BlogPage() {
  return <BlogPageClient />;
}
