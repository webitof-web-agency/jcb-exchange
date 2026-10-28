'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Loader2, X } from 'lucide-react';

/**
 * Shared building blocks for Finance & Accounts pages.
 * Professional UI/UX Design System Rules:
 * - Type Scale: 10px micro/shortcut · 11px meta/table heads · 12px labels/secondary · 13px body/inputs/table cells · 14px-15px panel titles/KPIs · 18px page titles
 * - Font Weights: 400 body · 500 labels/buttons · 600 titles/amounts/active states.
 * - Controls: 32px height (h-8), radius 8px (rounded-lg).
 * - Surfaces: 12px radius (rounded-xl) for panels/cards, crisp border-slate-200/90, subtle shadow-2xs.
 * - Color accents: JCB Gold/Amber (#F59E0B / #D97706) as primary; Semantic colors (Emerald, Amber, Rose, Sky, Violet) for status only.
 * - Tables: Sticky headers with backdrop-blur, tabular-nums right-aligned for monetary values.
 */

export const inputClass =
  'w-full rounded-lg border border-slate-200/90 bg-white px-2.5 py-[5px] text-[13px] leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 shadow-2xs';

/** Trigger classes for SearchableSelect so it matches `inputClass` (32px, 13px). */
export const selectButtonClass = 'h-8 rounded-lg px-2.5 py-0 text-[13px] border-slate-200/90 hover:border-slate-300 shadow-2xs';

export function Field({
  label,
  children,
  wide = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  const required = label.endsWith('*');
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="mb-1 block text-[12px] font-medium text-slate-700">
        {required ? label.slice(0, -1).trim() : label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`my-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-slate-50/30 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
      {children}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark';
  icon?: ReactNode;
  title?: string;
  className?: string;
};

const buttonVariants = {
  primary:
    'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:from-amber-300 hover:to-amber-400 font-semibold shadow-2xs shadow-amber-500/20 active:scale-[0.98]',
  secondary:
    'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50/90 hover:border-slate-300 font-medium shadow-2xs active:scale-[0.98]',
  danger:
    'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium active:scale-[0.98]',
  ghost:
    'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium active:scale-[0.98]',
  dark:
    'bg-slate-900 text-white hover:bg-slate-800 font-medium shadow-2xs active:scale-[0.98]',
} as const;

/** Classes for a link styled as a button (same 32px size as Button). */
export const buttonLinkClass = (variant: keyof typeof buttonVariants = 'secondary') =>
  `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition-all duration-150 ${buttonVariants[variant]}`;

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  busy,
  variant = 'secondary',
  icon,
  title,
  className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`${buttonLinkClass(variant)} disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 ${className}`}
    >
      {busy ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
      {title || actions ? (
        <div className="flex min-h-11 flex-col justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/60 via-slate-50/20 to-white px-3.5 py-2.5 sm:flex-row sm:items-center sm:px-4">
          <div className="min-w-0">
            {title ? <h3 className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-slate-900">{title}</h3> : null}
            {description ? <p className="text-[12px] leading-snug text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'slate',
  dot = false,
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
  dot?: boolean;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/15',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  };

  const dotTones = {
    slate: 'bg-slate-400',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
    blue: 'bg-sky-500',
    violet: 'bg-violet-500',
  };

  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotTones[tone]}`} />}
      {children}
    </span>
  );
}

/** Segmented control for switching views inside one page. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 sm:px-4" role="tablist">
      {tabs.map((tab) => {
        const isSelected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(tab.key)}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-all duration-150 ${
              isSelected
                ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-2 text-[12.5px] font-medium text-slate-700 select-none ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-amber-500 transition focus:ring-amber-400"
      />
      {label}
    </label>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-[13px] font-medium text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="m-3 rounded-xl border border-dashed border-slate-300/90 bg-slate-50/50 px-4 py-8 text-center sm:m-4">
      <p className="text-[13px] font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message, schemaMissing }: { message: string; schemaMissing?: boolean }) {
  if (schemaMissing) {
    return (
      <div className="m-3 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-[13px] text-amber-900 sm:m-4">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">Finance workspace database is not installed yet</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber-800">
            The finance hub migrations have not been applied to this database. Existing finance pages keep working; this module becomes available once the migration is deployed.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="m-3 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-[13px] text-rose-800 sm:m-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p className="font-medium">{message}</p>
    </div>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mx-3 mt-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-600 sm:mx-4">
      {children}
    </p>
  );
}

export const tableHeadClass =
  'sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-2xs';

export const cellClass = 'px-3 py-2 text-[12.5px] align-middle tabular-nums text-slate-700';

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Common accounting ranges; the financial year starts on 1 April. */
export const financeDatePresets = (now = new Date()) => {
  const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return [
    { key: 'today', label: 'Today', from: isoDay(now), to: isoDay(now) },
    { key: 'month', label: 'This month', from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) },
    {
      key: 'last-month',
      label: 'Last month',
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
    },
    { key: 'quarter', label: 'This quarter', from: isoDay(quarterStart), to: isoDay(now) },
    { key: 'fy', label: 'This FY', from: `${fyStartYear}-04-01`, to: isoDay(now) },
    { key: 'last-fy', label: 'Last FY', from: `${fyStartYear - 1}-04-01`, to: `${fyStartYear}-03-31` },
  ];
};

/** One-click date ranges next to from/to inputs; the active preset is highlighted. */
export function DatePresets({
  from,
  to,
  onSelect,
  only,
}: {
  from: string;
  to: string;
  onSelect: (range: { from: string; to: string }) => void;
  only?: string[];
}) {
  const presets = financeDatePresets().filter((preset) => !only || only.includes(preset.key));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {presets.map((preset) => {
        const active = preset.from === from && preset.to === to;
        return (
          <button
            key={preset.key}
            type="button"
            onClick={() => onSelect({ from: preset.from, to: preset.to })}
            className={`h-7 rounded-md px-2 text-[11.5px] font-medium transition-all duration-150 ${
              active
                ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                : 'border border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

/** Status filter chip with a count, used above registers. */
export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition-all duration-150 ${
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
          : 'border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/80'
      }`}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <span
          className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Professional KPI Stat Card for quick executive metrics. */
export function KpiStat({
  label,
  value,
  subtext,
  tone = 'slate',
  href,
}: {
  label: string;
  value: ReactNode;
  subtext?: string;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
  href?: string;
}) {
  const toneBorders = {
    slate: 'border-slate-200/80 hover:border-slate-300',
    green: 'border-emerald-200/80 hover:border-emerald-300',
    amber: 'border-amber-200/80 hover:border-amber-300',
    red: 'border-rose-200/80 hover:border-rose-300',
    blue: 'border-sky-200/80 hover:border-sky-300',
  };

  const content = (
    <div className={`group rounded-xl border bg-white p-3 transition hover:shadow-2xs ${toneBorders[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      {subtext && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{subtext}</p>}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

/** Status dot indicator with optional pulse */
export function StatusDot({
  tone = 'green',
  pulse = false,
}: {
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  pulse?: boolean;
}) {
  const color = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
    blue: 'bg-sky-500',
    slate: 'bg-slate-400',
  }[tone];

  return (
    <span className="relative flex h-2 w-2">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

/** Keyboard shortcut pill */
export function KeyboardShortcut({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-slate-500">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-slate-200/90 bg-slate-50 px-1 py-0.2 shadow-2xs font-semibold text-slate-600"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** Compact pagination bar for fast paging across all registers */
export function CompactPagination({
  total,
  page,
  totalPages,
  onPageChange,
  label = 'records',
}: {
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3.5 py-2 text-[12px] text-slate-600">
      <span className="tabular-nums font-medium">
        {total.toLocaleString()} {label} · Page {page} of {Math.max(totalPages, 1)}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
          className="h-7 px-2 text-[12px]"
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          icon={<ChevronRight className="h-3.5 w-3.5" />}
          className="h-7 px-2 text-[12px]"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
