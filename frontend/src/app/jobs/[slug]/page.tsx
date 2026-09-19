import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import JobDetailClient from './JobDetailClient';

interface JobDetailProps {
  params: Promise<{
    slug: string;
  }>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';

async function fetchJobData(slug: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/recruitment/public/jobs/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('Error fetching job details server side:', err);
    return null;
  }
}

export async function generateMetadata({ params }: JobDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchJobData(slug);
  if (!data || !data.job) {
    return {
      title: 'Job Not Found | JCB Exchange Careers',
    };
  }

  const job = data.job;
  const title = job.seoTitle || `${job.title} Job opening in ${job.locationCity} | JCB Exchange Careers`;
  const description =
    job.metaDescription ||
    job.summary ||
    `Apply for ${job.title} in ${job.locationCity}, ${job.locationState} at JCB Exchange. Join our high-growth heavy machinery marketplace team.`;
  const canonical = job.canonicalUrl || `${SITE_URL}/jobs/${job.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${job.title} | Careers at JCB Exchange`,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: job.ogImage ? [{ url: job.ogImage }] : undefined,
    },
  };
}

export default async function JobDetailPage({ params }: JobDetailProps) {
  const { slug } = await params;
  const data = await fetchJobData(slug);

  if (!data || !data.job) {
    notFound();
  }

  const job = data.job;
  const relatedJobs = data.relatedJobs || [];

  // Google JobPosting JSON-LD Schema
  const jobPostingSchema = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    identifier: {
      '@type': 'PropertyValue',
      name: 'JCB Exchange',
      value: job.jobCode,
    },
    datePosted: job.postedAt || job.createdAt,
    validThrough: job.deadline || undefined,
    employmentType: job.employmentType,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'JCB Exchange',
      sameAs: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.locationCity,
        addressRegion: job.locationState,
        addressCountry: 'IN',
      },
    },
    baseSalary: job.salaryVisibility && (job.minSalary || job.maxSalary)
      ? {
          '@type': 'MonetaryAmount',
          currency: job.currency || 'INR',
          value: {
            '@type': 'QuantitativeValue',
            minValue: job.minSalary || undefined,
            maxValue: job.maxSalary || undefined,
            unitText: 'YEAR',
          },
        }
      : undefined,
  };

  return (
    <>
      {/* Schema Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingSchema) }}
      />
      <JobDetailClient job={job} relatedJobs={relatedJobs} />
    </>
  );
}
