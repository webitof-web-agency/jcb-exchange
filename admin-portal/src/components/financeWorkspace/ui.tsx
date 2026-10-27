'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Database, Loader2, X } from 'lucide-react';

// Shared building blocks for Finance & Accounts pages. Design rules (keep new code on them):
//   Type   11px meta/overline · 12px labels/secondary · 13px body/tables · 15px panel titles/KPIs · 18px page title
//   Weight 400 body · 500 labels/buttons · 600 titles/amounts. No bold/extra-bold.
//   Size   controls 32px high, radius 8px (rounded-lg); cards radius 8px, 1px slate-200 border, no shadow
//   Space  4px grid: 12px panel padding (p-3), 8px cell padding (px-3 py-2), 12px gaps (gap-3)
//   Colour amber = the one accent (primary action, focus, active); green/red/blue/violet only for status
//   Numbers tabular-nums, right-aligned in tables

export const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-[5px] text-[13px] leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

/** Trigger classes for SearchableSelect so it matches `inputClass` (32px, 13px). */
export const selectButtonClass = 'h-8 rounded-lg px-2.5 py-0 text-[13px]';

export function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  const required = label.endsWith('*');
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="mb-1 block text-[12px] font-medium text-slate-600">
        {required ? label.slice(0, -1).trim() : label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string;
  className?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`my-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} overflow-hidden rounded-xl bg-white shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-6 text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">{children}</div>;
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: ReactNode;
  title?: string;
  className?: string;
};

const buttonVariants = {
  primary: 'bg-amber-400 text-slate-950 hover:bg-amber-300 font-semibold',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-medium',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-medium',
  ghost: 'text-slate-600 hover:bg-slate-100 font-medium',
} as const;

/** Classes for a link styled as a button (same 32px size as Button). */
export const buttonLinkClass = (variant: keyof typeof buttonVariants = 'secondary') =>
  `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition ${buttonVariants[variant]}`;

export function Button({ children, onClick, type = 'button', disabled, busy, variant = 'secondary', icon, title, className = '' }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title} className={`${buttonLinkClass(variant)} disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 ${className}`}>
      {busy ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Panel({ title, description, actions, children }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {title || actions ? (
        <div className="flex min-h-11 flex-col justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:flex-row sm:items-center">
          <div className="min-w-0">
            {title ? <h3 className="text-[15px] font-semibold leading-6 text-slate-900">{title}</h3> : null}
            {description ? <p className="text-[12px] leading-5 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/15',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  };
  return <span className={`inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset ring-slate-500/10 ${tones[tone]}`}>{children}</span>;
}

/** Segmented control for switching views inside one page. */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: Array<{ key: T; label: string }>; active: T; onChange: (key: T) => void }) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-slate-100 px-3 py-2" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)} className={`h-7 shrink-0 rounded-md px-2.5 text-[13px] font-medium transition ${active === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-[13px] text-slate-700 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 accent-amber-500" />
      {label}
    </label>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 p-6 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="m-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
      <p className="text-[13px] font-medium text-slate-700">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-lg text-[12px] leading-5 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message, schemaMissing }: { message: string; schemaMissing?: boolean }) {
  if (schemaMissing) {
    return (
      <div className="m-3 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
        <Database className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Finance workspace database is not installed yet</p>
          <p className="mt-0.5 text-[12px] leading-5">The finance hub migrations have not been applied to this database. Existing finance pages keep working; this module becomes available once the migration is deployed.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="m-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <p className="mx-3 mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{children}</p>;
}

export const tableHeadClass = 'bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500';
export const cellClass = 'px-3 py-2 align-top tabular-nums';

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Common accounting ranges; the financial year starts on 1 April. */
export const financeDatePresets = (now = new Date()) => {
  const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return [
    { key: 'today', label: 'Today', from: isoDay(now), to: isoDay(now) },
    { key: 'month', label: 'This month', from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) },
    { key: 'last-month', label: 'Last month', from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { key: 'quarter', label: 'This quarter', from: isoDay(quarterStart), to: isoDay(now) },
    { key: 'fy', label: 'This FY', from: `${fyStartYear}-04-01`, to: isoDay(now) },
    { key: 'last-fy', label: 'Last FY', from: `${fyStartYear - 1}-04-01`, to: `${fyStartYear}-03-31` },
  ];
};

/** One-click date ranges next to from/to inputs; the active preset is highlighted. */
export function DatePresets({ from, to, onSelect, only }: { from: string; to: string; onSelect: (range: { from: string; to: string }) => void; only?: string[] }) {
  const presets = financeDatePresets().filter((preset) => !only || only.includes(preset.key));
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {presets.map((preset) => {
        const active = preset.from === from && preset.to === to;
        return (
          <button key={preset.key} type="button" onClick={() => onSelect({ from: preset.from, to: preset.to })} className={`h-7 rounded-md px-2 text-[12px] font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

/** Status filter chip with a count, used above registers. */
export function FilterChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12px] font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
      {children}
      {count !== undefined ? <span className={`rounded px-1 text-[11px] ${active ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{count}</span> : null}
    </button>
  );
}
