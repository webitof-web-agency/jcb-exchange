'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock, CornerDownLeft, FileText, Plus, Search, Star } from 'lucide-react';
import { useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { financeDashboardPath, financeModulePath, type FinanceWorkspaceGroup } from '@/lib/financeWorkspace';
import { useFinancePrefs } from './financePrefs';

type Item = { id: string; section: 'Pinned' | 'Recent' | 'Create' | 'Pages'; label: string; hint?: string; href: string; keywords: string };

const sectionIcons = { Pinned: Star, Recent: Clock, Create: Plus, Pages: FileText } as const;

/**
 * Ctrl/⌘ + K quick search for Finance & Accounts: jump to any permitted page or start a new
 * voucher, bill or expense.
 */
export default function FinanceCommandPalette({ prefix, groups, legacyItems, showDashboard }: {
  prefix: string;
  groups: FinanceWorkspaceGroup[];
  legacyItems: Array<{ href: string; suffix: string; label: string }>;
  showDashboard: boolean;
}) {
  const router = useRouter();
  const access = useFinanceWorkspaceAccess();
  const prefs = useFinancePrefs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery('');
        setActive(0);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const pages = useMemo<Item[]>(() => {
    const items: Item[] = [];
    if (showDashboard) items.push({ id: 'dashboard', section: 'Pages', label: 'Finance Dashboard', hint: 'Overview', href: financeDashboardPath(prefix), keywords: 'home overview kpi' });
    groups.forEach((group) => group.modules.forEach((module) => items.push({ id: module.key, section: 'Pages', label: module.label, hint: group.label, href: financeModulePath(prefix, module.key), keywords: `${module.description} ${group.label}` })));
    legacyItems.forEach((item) => items.push({ id: item.suffix, section: 'Pages', label: item.label, hint: 'Finance & Accounts', href: item.href, keywords: item.suffix }));
    return items;
  }, [groups, legacyItems, prefix, showDashboard]);

  const actions = useMemo<Item[]>(() => {
    const hasGroup = (key: string) => groups.some((group) => group.key === key);
    const items: Item[] = [];
    if (hasGroup('accounting-books') && access.can(['fh.books.manage'])) {
      items.push(
        { id: 'new-payment', section: 'Create', label: 'New payment voucher', hint: 'Money paid out', href: financeModulePath(prefix, 'payment-vouchers', { new: 'PAYMENT' }), keywords: 'pay vendor bank cash' },
        { id: 'new-receipt', section: 'Create', label: 'New receipt voucher', hint: 'Money received', href: financeModulePath(prefix, 'receipt-vouchers', { new: 'RECEIPT' }), keywords: 'collect customer bank cash' },
        { id: 'new-journal', section: 'Create', label: 'New journal entry', hint: 'Adjustment between ledgers', href: financeModulePath(prefix, 'journal-entries', { new: 'JOURNAL' }), keywords: 'jv adjustment' },
        { id: 'new-contra', section: 'Create', label: 'New contra voucher', hint: 'Bank ↔ cash transfer', href: financeModulePath(prefix, 'contra-adjustment-vouchers', { new: 'CONTRA' }), keywords: 'transfer deposit withdrawal' },
      );
    }
    if (hasGroup('purchases') && access.can(['fh.purchases.manage'])) items.push({ id: 'new-bill', section: 'Create', label: 'New purchase bill', hint: 'Supplier bill with GST', href: financeModulePath(prefix, 'purchase-bills-invoices', { new: 'PURCHASE_BILL' }), keywords: 'vendor supplier invoice gst' });
    const expenses = legacyItems.find((item) => item.suffix === '/finance/expenses');
    if (expenses) items.push({ id: 'new-expense', section: 'Create', label: 'New expense / transaction', hint: 'Expenses & Transactions', href: `${expenses.href}?new=1`, keywords: 'expense debit credit spend' });
    return items;
  }, [access, groups, legacyItems, prefix]);

  const results = useMemo<Item[]>(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (item: Item) => words.every((word) => `${item.label} ${item.hint ?? ''} ${item.keywords}`.toLowerCase().includes(word));
    if (words.length) return [...actions.filter(matches), ...pages.filter(matches)].slice(0, 40);
    const known = new Set(pages.map((item) => item.href.split('?')[0]));
    const pinned = prefs.pins.filter((item) => known.has(item.href)).map((item) => ({ id: `pin-${item.href}`, section: 'Pinned' as const, label: item.label, hint: item.group, href: item.href, keywords: '' }));
    const recent = prefs.recent.filter((item) => known.has(item.href) && !prefs.isPinned(item.href)).slice(0, 5).map((item) => ({ id: `recent-${item.href}`, section: 'Recent' as const, label: item.label, hint: item.group, href: item.href, keywords: '' }));
    return [...pinned, ...recent, ...actions, ...pages];
  }, [actions, pages, prefs, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(results[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/60 backdrop-blur-xs p-3 pt-[10vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Finance quick search">
        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 to-white px-3.5">
          <Search className="h-4 w-4 shrink-0 text-amber-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onInputKey}
            placeholder="Search 96+ finance modules or actions… (e.g. gst, day book, new payment)"
            className="h-11 w-full bg-transparent text-[13.5px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search finance pages"
          />
          <kbd className="shrink-0 rounded-md border border-slate-200/90 bg-white px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 shadow-2xs">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto py-1 divide-y divide-slate-50">
          {!results.length ? <p className="px-4 py-8 text-center text-[13px] text-slate-500">No finance page matches “{query}”.</p> : results.map((item, index) => {
            const showSection = index === 0 || results[index - 1].section !== item.section;
            const Icon = sectionIcons[item.section];
            return (
              <div key={item.id}>
                {showSection ? <p className="px-3.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{item.section}</p> : null}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] transition-all ${active === index ? 'bg-amber-50/70 text-slate-950 font-semibold border-l-2 border-amber-400' : 'text-slate-700 font-normal hover:bg-slate-50'}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${item.section === 'Create' ? 'text-amber-600' : item.section === 'Pinned' ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? <span className="shrink-0 truncate text-[11px] font-normal text-slate-400">{item.hint}</span> : null}
                  {active === index ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-mono"><kbd className="rounded border border-slate-200 bg-white px-1">↑</kbd><kbd className="rounded border border-slate-200 bg-white px-1">↓</kbd> navigate</span>
            <span className="inline-flex items-center gap-1 font-mono"><CornerDownLeft className="h-3 w-3" /> select</span>
          </div>
          <span className="text-slate-400">Shortcuts: <kbd className="rounded border border-slate-200 bg-white px-1">/</kbd> search · <kbd className="rounded border border-slate-200 bg-white px-1">N</kbd> new</span>
        </div>
      </div>
    </div>
  );
}
