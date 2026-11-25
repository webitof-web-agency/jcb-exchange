'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { purifyHtml } from '@/lib/safeHtml';

type LegalPageContentProps = {
  pageKey: 'privacyPolicy' | 'termsConditions' | 'disclaimer' | 'refundReturnPolicy';
  fallbackHtml: React.ReactNode;
};

const LEGAL_CONTENT_CLASS_NAME =
  'max-w-none text-sm text-gray-800 leading-relaxed sm:text-base ' +
  '[&_h2]:text-xl sm:[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-3 ' +
  '[&_h3]:text-base sm:[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-4 [&_h3]:mb-2 ' +
  '[&_p]:text-gray-700 [&_p]:leading-7 [&_p]:my-2.5 ' +
  '[&_ul]:my-3.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 ' +
  '[&_ol]:my-3.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5 ' +
  '[&_li]:text-gray-700 [&_li]:leading-7 [&_li]:pl-1 ' +
  '[&_strong]:font-bold [&_strong]:text-gray-900 ' +
  '[&_b]:font-bold [&_b]:text-gray-900 ' +
  '[&_.legal-callout]:my-4 [&_.legal-callout]:rounded-2xl [&_.legal-callout]:border-l-4 [&_.legal-callout]:border-amber-400 [&_.legal-callout]:bg-amber-50 [&_.legal-callout]:px-4 [&_.legal-callout]:py-3 [&_.legal-callout]:text-amber-950';

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
        dangerouslySetInnerHTML={{ __html: purifyHtml(customHtml) }}
      />
    );
  }

  return <>{fallbackHtml}</>;
}
