'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
        const input = scope.querySelector<HTMLInputElement>('input:not([type="date"]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="number"]):not([disabled])');
        if (input) { event.preventDefault(); input.focus(); input.select(); }
      } else if (event.key === 'n' || event.key === 'N') {
        const button = Array.from(scope.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a[href]'))
          .find((element) => !(element as HTMLButtonElement).disabled && /^(New|Add)\b/.test(element.textContent?.trim() || ''));
        if (button) { event.preventDefault(); button.click(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [barRef]);
}

/**
 * Top of every Finance & Accounts page. The page title lives in the portal header, so this only
 * shows the page's action buttons (if any) as a right-aligned row. It also wires the `/` and `N`
 * shortcuts and, with `page`, adds the page to the user's recent pages.
 */
export default function FinancePageHeader({ actions, page }: { actions?: ReactNode; page?: FinancePageRef }) {
  const barRef = useRef<HTMLDivElement>(null);
  const { recordVisit } = useFinancePrefs();
  usePageShortcuts(barRef);
  useEffect(() => {
    if (page) recordVisit(page);
  }, [page?.href, page?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  return actions
    ? <div ref={barRef} className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    : <div ref={barRef} hidden />;
}
