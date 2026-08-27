'use client';

import { PauseCircle, LogIn, RotateCcw } from 'lucide-react';
import Link from 'next/link';

type AccountAccessInactiveProps = {
  title?: string;
  description?: string;
  accountLabel?: string;
  onRetry?: () => void;
};

export default function AccountAccessInactive({
  title = 'Account inactive',
  description = 'This account has been temporarily inactive by the super admin. Your records are safe, but portal access is paused until the account is reactivated.',
  accountLabel = 'Portal account',
  onRetry,
}: AccountAccessInactiveProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#253047,_#131b28_62%,_#0b1018)] px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] backdrop-blur">
        <div className="border-b border-slate-100 bg-gradient-to-r from-[#172033] to-[#101827] px-6 py-5">
          <p className="text-[11px] uppercase tracking-[0.35em] text-[#7dd3fc]">{accountLabel}</p>
        </div>

        <div className="px-6 py-8 sm:px-8">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <PauseCircle className="h-8 w-8" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
            Ask the super admin to mark the account active again. Once reactivated, you can sign in normally.
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#7dd3fc] px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-[#5fc6f6]"
            >
              <LogIn className="h-4 w-4" />
              Go to login
            </Link>

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Check again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

