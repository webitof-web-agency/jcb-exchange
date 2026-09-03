'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';

type LegalPageContentProps = {
  pageKey: 'privacyPolicy' | 'termsConditions' | 'disclaimer';
  fallbackHtml: React.ReactNode;
};

const LEGAL_CONTENT_CLASS_NAME =
  'prose max-w-none text-sm text-gray-700 leading-relaxed sm:text-base prose-headings:text-gray-900 prose-headings:font-semibold prose-p:text-gray-700 prose-p:leading-7 prose-li:text-gray-700 prose-li:leading-7 prose-ul:my-4 prose-ol:my-4 [&_.legal-callout]:my-4 [&_.legal-callout]:rounded-2xl [&_.legal-callout]:border-l-4 [&_.legal-callout]:border-amber-400 [&_.legal-callout]:bg-amber-50 [&_.legal-callout]:px-4 [&_.legal-callout]:py-3 [&_.legal-callout]:text-amber-950';

export default function LegalPageContent({ pageKey, fallbackHtml }: LegalPageContentProps) {
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchLegalContent = async () => {
      try {
        const response = await api.get('/master/footer');
        if (cancelled) return;
        
        const html = response.data.data?.legalPages?.[pageKey];
        if (html && typeof html === 'string' && html.trim().length > 0) {
          setCustomHtml(html.trim());
        }
      } catch {
        // Fallback to static template on network error
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchLegalContent();

    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  if (!loading && customHtml) {
    return (
      <div 
        className={LEGAL_CONTENT_CLASS_NAME}
        dangerouslySetInnerHTML={{ __html: customHtml }}
      />
    );
  }

  return <>{fallbackHtml}</>;
}
