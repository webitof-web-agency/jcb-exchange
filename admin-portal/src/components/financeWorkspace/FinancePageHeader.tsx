'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  LayoutDashboard,
} from 'lucide-react';
import {
  financeDashboardPath,
  financeModulePath,
  financePortalPrefix,
  matchFinanceModulePath,
  type FinanceWorkspaceGroup,
  type FinanceWorkspaceModule,
} from '@/lib/financeWorkspace';
import { useFinancePrefs, type FinancePageRef } from './financePrefs';

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)));
};

/**
 * Page shortcuts, scoped to the page that renders the bar: `/` focuses the page's first search
 * or text input, `N` presses its first New / Add button. Ignored while typing or when a popup is open.
 */
function usePageShortcuts(barRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const scope = barRef.current?.parentElement;
      if (!scope) return;
      if (event.key === '/') {
        const input = scope.querySelector<HTMLInputElement>(
          'input:not([type="date"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="number"]):not([disabled])'
        );
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      } else if (event.key === 'n' || event.key === 'N') {
        const button = Array.from(
          scope.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a[href]')
        ).find(
          (element) =>
            !(element as HTMLButtonElement).disabled &&
            /^(New|Add)\b/.test(element.textContent?.trim() || '')
        );
        if (button) {
          event.preventDefault();
          button.click();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [barRef]);
}

/**
 * Top of every Finance & Accounts page.
 * Professional UX Redesign:
 * - Interactive Breadcrumbs: Dashboard › Group › Current Module
 * - Sibling Module Quick-Tabs: 1-click switcher across all sister modules in the same group
 * - Keyboard Shortcut Badges: [/] Search · [N] New · [Ctrl+K] Palette
 * - Action toolbar for page-specific buttons
 */
export default function FinancePageHeader({
  actions,
  page,
  group,
  currentModule,
}: {
  actions?: ReactNode;
  page?: FinancePageRef;
  group?: FinanceWorkspaceGroup;
  currentModule?: FinanceWorkspaceModule;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const prefix = financePortalPrefix(pathname);
  const match = matchFinanceModulePath(pathname);
  const { recordVisit } = useFinancePrefs();

  usePageShortcuts(barRef);

  useEffect(() => {
    if (page) recordVisit(page);
  }, [page?.href, page?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeGroup = group ?? match?.group;
  const activeModule = currentModule ?? match?.module;
  const isDashboard = pathname === financeDashboardPath(prefix);

  const groupLabel = page?.group || activeGroup?.label;
  const moduleLabel = page?.label || activeModule?.label;
  const siblingModules = activeGroup?.modules ?? [];

  return (
    <div ref={barRef} className="space-y-2">
      {/* Top Breadcrumb & Status Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-2xs">
        {/* Left: Breadcrumbs & Module Info */}
        <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
          <Link
            href={financeDashboardPath(prefix)}
            className="flex items-center gap-1 font-medium text-slate-500 transition hover:text-amber-600"
            title="Finance Dashboard"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Finance</span>
          </Link>

          {groupLabel && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate font-medium text-slate-600">{groupLabel}</span>
            </>
          )}

          {moduleLabel && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate font-semibold text-slate-900">{moduleLabel}</span>
            </>
          )}
        </div>

        {/* Right: Quick Shortcuts & Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Keyboard shortcut pills */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-medium text-slate-600">
              <kbd>/</kbd> search
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-medium text-slate-600">
              <kbd>N</kbd> new
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-medium text-slate-600">
              <kbd>Ctrl+K</kbd> jump
            </span>
          </div>

          {/* Action buttons passed from page */}
          {actions ? (
            <div className="flex items-center gap-1.5">{actions}</div>
          ) : null}
        </div>
      </div>

      {/* Sibling Modules Switcher Tabs (when inside a module group) */}
      {!isDashboard && siblingModules.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 p-1 backdrop-blur-xs shadow-2xs scrollbar-none">
          {siblingModules.map((m) => {
            const isCurrent = activeModule?.key === m.key;
            const href = financeModulePath(prefix, m.key);
            return (
              <Link
                key={m.key}
                href={href}
                title={m.description}
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition-all duration-150 ${
                  isCurrent
                    ? 'bg-slate-900 font-semibold text-white shadow-2xs'
                    : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="truncate">{m.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
