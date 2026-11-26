'use client';

import type { LucideIcon } from 'lucide-react';

/** Small building blocks shared by the Organisation page and its Departments section. */

/** A table header cell that stays visible while its list scrolls. */
export const orgTh = 'sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_#e2e8f0]';

export function Count({ value, label }: { value: number; label: string }) {
  return <span title={label} className="inline-flex min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{value}</span>;
}

export function ActiveChip({ active }: { active: boolean }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}`}>{active ? 'Active' : 'Switched off'}</span>;
}

export function SectionCard({ id, icon: Icon, title, description, count, action, children }: { id?: string; icon: LucideIcon; title: string; description: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">{title} <Count value={count} label={`${count} shown`} /></h2>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="px-6 py-8 text-center">
      <Icon className="mx-auto h-7 w-7 text-slate-300" />
      <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

const ICON_TONES = {
  default: 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
  danger: 'text-slate-400 hover:bg-rose-50 hover:text-rose-600',
  success: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
} as const;

/** An icon-only row action: always named for screen readers and as a tooltip. */
export function IconButton({ label, onClick, tone = 'default', disabled = false, children }: { label: string; onClick: () => void; tone?: keyof typeof ICON_TONES; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${ICON_TONES[tone]}`}>
      {children}
    </button>
  );
}
