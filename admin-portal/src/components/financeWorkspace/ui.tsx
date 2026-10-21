'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Database, Loader2, X } from 'lucide-react';

// Shared building blocks for finance workspace modules. Visual language follows the
// Expenses & Transactions page (slate borders, rounded-xl, amber primary button).

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60';

export function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  const required = label.endsWith('*');
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {required ? label.slice(0, -1).trim() : label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] leading-4 text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`my-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} overflow-hidden rounded-2xl bg-white shadow-2xl`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>;
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
};

const buttonVariants = {
  primary: 'bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-semibold',
  ghost: 'text-slate-600 hover:bg-slate-100 font-semibold',
} as const;

export function Button({ children, onClick, type = 'button', disabled, busy, variant = 'secondary', icon, title }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} title={title} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonVariants[variant]}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Panel({ title, description, actions, children }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {title || actions ? (
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            {title ? <h3 className="text-base font-bold text-slate-900">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: Array<{ key: T; label: string }>; active: T; onChange: (key: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-2" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange(tab.key)} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition ${active === tab.key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-700 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-amber-500" />
      {label}
    </label>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="m-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message, schemaMissing }: { message: string; schemaMissing?: boolean }) {
  if (schemaMissing) {
    return (
      <div className="m-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Database className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Finance workspace database is not installed yet</p>
          <p className="mt-1 text-xs leading-5">The finance hub migrations have not been applied to this database. Existing finance pages keep working; this module becomes available once the migration is deployed.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="m-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <p className="mx-5 mt-4 rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">{children}</p>;
}

export const tableHeadClass = 'bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500';
export const cellClass = 'px-4 py-3 align-top';
