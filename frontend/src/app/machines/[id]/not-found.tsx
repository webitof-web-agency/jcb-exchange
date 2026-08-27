'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-jcb-yellow">{t('machineDetails.notFoundTag')}</p>
        <h2 className="mt-3 text-3xl font-bold text-gray-900">{t('machineDetails.notFoundTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          {t('machineDetails.notFoundDescription')}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/machines"
            className="rounded-lg bg-jcb-yellow px-6 py-3 font-bold text-black transition-colors hover:bg-yellow-400"
          >
            {t('machineDetails.browseMachines')}
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t('machineDetails.goHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
