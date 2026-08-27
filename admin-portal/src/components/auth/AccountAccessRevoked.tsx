'use client';

import { ShieldAlert, LogIn, RotateCcw } from 'lucide-react';
import Link from 'next/link';

type AccountAccessRevokedProps = {
  title?: string;
  description?: string;
  accountLabel?: string;
  onRetry?: () => void;
};

export default function AccountAccessRevoked({
  title = 'Account access revoked',
  description = 'Your account was removed, deactivated, or blocked by the super admin. Please contact support or your account owner to restore access.',
  accountLabel = 'Portal account',
  onRetry,
}: AccountAccessRevokedProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#2a2a2a,_#111111_62%,_#090909)] px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] backdrop-blur">
        <div className="border-b border-gray-100 bg-gradient-to-r from-[#1f1f1f] to-[#111111] px-6 py-5">
          <p className="text-[11px] uppercase tracking-[0.35em] text-[#FFC107]">{accountLabel}</p>
        </div>

        <div className="px-6 py-8 sm:px-8">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            If this looks incorrect, ask the super admin to restore or reactivate the account, then sign in again.
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#e4ad07]"
            >
              <LogIn className="h-4 w-4" />
              Go to login
            </Link>

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

