'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type LegalDocumentShellProps = {
  titleKey: 'legalPages.privacyPolicy' | 'legalPages.termsAndConditions' | 'legalPages.disclaimer';
  children: ReactNode;
};

export default function LegalDocumentShell({ titleKey, children }: LegalDocumentShellProps) {
  const { t } = useTranslation();
  const pageTitle = t(titleKey, 'Legal Page');

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 text-gray-900 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav aria-label={t('legalPages.breadcrumbAria', 'Breadcrumb')} className="flex items-center space-x-2 text-xs text-gray-500">
          <Link href="/" className="font-medium transition-colors hover:text-amber-600">
            {t('navbar.home', 'Home')}
          </Link>
          <ChevronRight size={12} className="text-gray-400" />
          <span className="font-semibold text-gray-900">{pageTitle}</span>
        </nav>

        <div className="space-y-8 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
          <header className="border-b border-gray-100 pb-6 sm:pb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{pageTitle}</h1>
          </header>

          {children}
        </div>
      </div>
    </main>
  );
}
