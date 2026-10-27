'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  BadgeIndianRupee, BarChart3, BookOpen, CarFront, ChevronDown, FileSearch, Gauge, HandCoins, Landmark, LayoutDashboard,
  type LucideIcon, Receipt, Scale, Settings2, ShoppingCart, UsersRound, Wallet,
} from 'lucide-react';
import { financeDashboardPath, financeLegacyLinks, financeModulePath, financeWorkspaceGroups, type FinanceWorkspaceGroup } from '@/lib/financeWorkspace';

const groupIcons: Record<string, LucideIcon> = {
  dashboard: Gauge,
  purchases: ShoppingCart,
  'sales-revenue': Receipt,
  'vehicle-finance': CarFront,
  'party-ledgers': UsersRound,
  'receivables-payables': Scale,
  'banking-cash': Landmark,
  'accounting-books': BookOpen,
  'expenses-assets': Wallet,
  payroll: HandCoins,
  'taxation-compliance': BadgeIndianRupee,
  'financial-reports': BarChart3,
  'ca-audit-workspace': FileSearch,
  'finance-settings': Settings2,
};

type LegacyItem = { href: string; suffix: string; label: string; badge: number };

/**
 * Finance & Accounts sidebar body: the finance dashboard, then every permitted workspace group as a
 * collapsible sub-menu of its pages. Older finance pages (Invoices, Expenses, Prime payments) sit
 * inside their matching group. The group holding the current page opens automatically.
 */
export default function FinanceSidebarNav({ pathname, prefix, showDashboard, groups, legacyItems, onNavigate }: {
  pathname: string;
  prefix: string;
  showDashboard: boolean;
  groups: FinanceWorkspaceGroup[];
  legacyItems: LegacyItem[];
  onNavigate: () => void;
}) {
  const [expansion, setExpansion] = useState<{ pathname: string; values: Record<string, boolean> }>({ pathname: '', values: {} });
  const isUnder = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const menu = groups.map((group) => ({ key: group.key, label: group.label, items: group.modules.map((module) => ({ href: financeModulePath(prefix, module.key), label: module.label, badge: 0 })) }));
  legacyItems.forEach((item) => {
    const groupKey = financeLegacyLinks.find((link) => link.suffix === item.suffix)?.groupKey ?? 'expenses-assets';
    let target = menu.find((group) => group.key === groupKey);
    if (!target) {
      // The user can open the older page without any workspace permission for its group.
      target = { key: groupKey, label: financeWorkspaceGroups.find((group) => group.key === groupKey)?.label ?? 'More', items: [] };
      menu.push(target);
    }
    target.items.unshift({ href: item.href, label: item.label, badge: item.badge });
  });

  const dashboardHref = financeDashboardPath(prefix);
  const dashboardActive = pathname === dashboardHref;

  return (
    <>
      {showDashboard ? (
        <Link
          href={dashboardHref}
          onClick={onNavigate}
          className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-all duration-150 ${
            dashboardActive
              ? 'bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent text-[#FFC107] font-semibold border-l-[3px] border-[#FFC107] shadow-2xs'
              : 'border-l-[3px] border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] font-medium'
          }`}
        >
          <LayoutDashboard className={`h-4 w-4 shrink-0 ${dashboardActive ? 'text-[#FFC107]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
          <span className="truncate">Finance Dashboard</span>
        </Link>
      ) : null}
      {menu.map((group) => {
        const Icon = groupIcons[group.key] ?? BookOpen;
        const isGroupActive = group.items.some((item) => isUnder(item.href));
        const override = expansion.pathname === pathname ? expansion.values[group.key] : undefined;
        const isExpanded = override ?? isGroupActive;
        const groupBadge = group.items.reduce((sum, item) => sum + item.badge, 0);
        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => setExpansion((current) => ({ pathname, values: { ...(current.pathname === pathname ? current.values : {}), [group.key]: !isExpanded } }))}
              aria-expanded={isExpanded}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all duration-150 ${
                isGroupActive
                  ? 'bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent text-[#FFC107] font-semibold border-l-[3px] border-[#FFC107]'
                  : 'border-l-[3px] border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] font-medium'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon className={`h-4 w-4 shrink-0 ${isGroupActive ? 'text-[#FFC107]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
                <span className="truncate">{group.label}</span>
              </span>
              <span className="ml-1.5 flex shrink-0 items-center gap-1.5">
                {!isExpanded && groupBadge > 0 ? (
                  <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{groupBadge > 99 ? '99+' : groupBadge}</span>
                ) : <span className="text-[10px] font-medium text-zinc-600">{group.items.length}</span>}
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} ${isGroupActive ? 'text-[#FFC107]' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
              </span>
            </button>
            {isExpanded ? (
              <div className="my-1 ml-3.5 space-y-0.5 border-l border-white/[0.08] pl-2.5">
                {group.items.map((item) => {
                  const active = isUnder(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150 ${
                        active ? 'bg-[#FFC107]/15 font-semibold text-[#FFC107]' : 'font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-[#FFC107] shadow-[0_0_6px_#FFC107]' : 'bg-zinc-600 group-hover:bg-zinc-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge > 0 ? <span className="min-w-[1.15rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">{item.badge > 99 ? '99+' : item.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
