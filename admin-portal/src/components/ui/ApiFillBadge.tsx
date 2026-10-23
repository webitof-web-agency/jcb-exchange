'use client';

import type { ReactNode } from 'react';

type ApiFillProps = {
  /** Where the value comes from, e.g. "RC / chassis verification". */
  source: string;
  /** True once the value has actually been filled from that source. */
  filled?: boolean;
};

export function ApiSparkleIcon({ label, className = '' }: { label: string; className?: string }) {
  return <span role="img" aria-label={label} title={label} className={`pointer-events-none inline-block ${className}`} style={{ backgroundImage: 'linear-gradient(135deg, #6D28D9 0%, #4F46E5 48%, #3B61D9 100%)', maskImage: "url('/icons/sparkler-7711234.png')", WebkitMaskImage: "url('/icons/sparkler-7711234.png')", maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center', WebkitMaskPosition: 'center', maskSize: 'contain', WebkitMaskSize: 'contain' }} />;
}

/** Marks an input that can be auto-filled from an API with the shared sparkle marker. */
export function ApiFillBadge({ source, filled = false }: ApiFillProps) {
  const label = filled ? `Auto-filled from ${source}` : `Can be auto-filled from ${source}`;
  return <ApiSparkleIcon label={label} className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 drop-shadow-[0_1px_1px_rgba(59,97,217,0.22)]" />;
}

/** Wraps an input (or input group), adds the sparkle marker, and reserves input space for it. */
export function ApiFillBox({ apiFill, children, className = '' }: { apiFill?: ApiFillProps | null; children: ReactNode; className?: string }) {
  if (!apiFill) return <>{children}</>;
  return <div className={`relative ${className}`}><div className="[&>input]:!pl-10 [&>select]:!pl-10 [&>button]:!pl-10 [&>div>button]:!pl-10 [&>div>input]:!pl-10 [&>div>select]:!pl-10">{children}</div><ApiFillBadge source={apiFill.source} filled={apiFill.filled} /></div>;
}

/** One-line key shown above a form that has API-fillable fields. */
export function ApiFillLegend({ children }: { children?: ReactNode }) {
  return <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500"><ApiSparkleIcon label="API-fillable field" className="h-4 w-4 shrink-0" /><span>{children || 'Fields are filled automatically from the API. Fields without it must be entered manually.'}</span></p>;
}
