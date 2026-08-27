"use client";

import { useTranslation } from '@/hooks/useTranslation';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center">
      <div className="max-w-md rounded-2xl border border-red-100 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-red-500">{t('machineDetails.errorTag')}</p>
        <h2 className="mt-3 text-2xl font-bold text-gray-900">{t('machineDetails.errorTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">
          {t('machineDetails.errorDescription')}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg bg-jcb-yellow px-6 py-3 font-bold text-black transition-colors hover:bg-yellow-400"
        >
          {t('machineDetails.tryAgain')}
        </button>
      </div>
    </div>
  );
}
