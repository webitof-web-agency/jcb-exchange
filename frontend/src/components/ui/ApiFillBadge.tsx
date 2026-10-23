'use client';

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

type ApiFillProps = {
  /** Where the value comes from, e.g. "RC / chassis verification". */
  source: string;
  /** True once the value has actually been filled from that source. */
  filled?: boolean;
};

/**
 * Marks an input that can be auto-filled from an API, so staff know what they
 * only need to verify and what they must type by hand. Sits on the input's top
 * border like a fieldset legend, so it never covers the value, hints or chevrons.
 */
export function ApiFillBadge({ source, filled = false }: ApiFillProps) {
  const label = filled ? `Auto-filled from ${source}` : `Can be auto-filled from ${source}`;
  return (
    <span role="img" aria-label={label} title={label} className={`pointer-events-auto absolute -top-[7px] right-2 z-[1] inline-flex h-[14px] items-center gap-0.5 rounded-full border px-1.5 text-[9px] font-extrabold uppercase leading-none tracking-wide shadow-2xs ${filled ? 'border-violet-500 bg-violet-600 text-white' : 'border-violet-200 bg-white text-violet-600'}`}>
      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}

/** Wraps an input (or input group) and adds the AI badge when `apiFill` is given. */
export function ApiFillBox({ apiFill, children, className = '' }: { apiFill?: ApiFillProps | null; children: ReactNode; className?: string }) {
  if (!apiFill) return <>{children}</>;
  return <div className={`relative ${className}`}>{children}<ApiFillBadge source={apiFill.source} filled={apiFill.filled} /></div>;
}

/** One-line key shown above a form that has API-fillable fields. */
export function ApiFillLegend({ children }: { children?: ReactNode }) {
  return <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500"><span className="inline-flex h-[14px] items-center gap-0.5 rounded-full border border-violet-200 bg-white px-1.5 text-[9px] font-extrabold uppercase leading-none tracking-wide text-violet-600"><Sparkles className="h-2.5 w-2.5" aria-hidden="true" /></span><span>{children || 'Fields are filled automatically from the API. Fields without it must be entered manually.'}</span></p>;
}
