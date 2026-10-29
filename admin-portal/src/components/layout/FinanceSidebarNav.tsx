'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  BadgeIndianRupee, BarChart3, BookOpen, CarFront, ChevronDown, ChevronsDownUp, ChevronsUpDown,
  FileSearch, Gauge, HandCoins, Landmark, LayoutDashboard,
  type LucideIcon, Receipt, Scale, Search, Settings2, ShoppingCart, UsersRound, Wallet, X,
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

type MenuItem = {
  href: string;
  label: string;
  badge: number;
};

type MenuGroup = {
  key: string;
  label: string;
  items: MenuItem[];
};

/**
 * Finance & Accounts sidebar body:
 * - Top quick search filter for instantly finding any of the 96+ finance modules
 * - Expand / Collapse all controls
 * - Compact, professional density and clear visual hierarchy
 * - Active module highlighting with gold accent and glowing indicator
 */
export default function FinanceSidebarNav({
  pathname,
  prefix,
  showDashboard,
  groups,
  legacyItems,
  onNavigate,
}: {
  pathname: string;
  prefix: string;
  showDashboard: boolean;
  groups: FinanceWorkspaceGroup[];
  legacyItems: LegacyItem[];
  onNavigate: () => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [expansion, setExpansion] = useState<{ pathname: string; values: Record<string, boolean> }>({ pathname: '', values: {} });

  const isUnder = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Build the complete menu tree with groups and legacy items
  const menu: MenuGroup[] = useMemo(() => {
    const list = groups.map((group) => ({
      key: group.key,
      label: group.label,
      items: group.modules.map((module) => ({
        href: financeModulePath(prefix, module.key),
        label: module.label,
        badge: 0,
      })),
    }));

    legacyItems.forEach((item) => {
      const groupKey = financeLegacyLinks.find((link) => link.suffix === item.suffix)?.groupKey ?? 'expenses-assets';
      let target = list.find((group) => group.key === groupKey);
      if (!target) {
        target = { key: groupKey, label: financeWorkspaceGroups.find((g) => g.key === groupKey)?.label ?? 'More', items: [] };
        list.push(target);
      }
      target.items.unshift({ href: item.href, label: item.label, badge: item.badge });
    });

    return list;
  }, [groups, legacyItems, prefix]);

  const query = filterQuery.trim().toLowerCase();

  // Filtered menu based on user search
  const filteredMenu = useMemo(() => {
    if (!query) return menu;
    return menu
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(query);
        const matchingItems = group.items.filter(
          (item) => item.label.toLowerCase().includes(query) || groupMatches,
        );
        return matchingItems.length > 0 ? { ...group, items: matchingItems } : null;
      })
      .filter((g): g is MenuGroup => g !== null);
  }, [menu, query]);

  const totalFilteredItems = useMemo(
    () => filteredMenu.reduce((sum, g) => sum + g.items.length, 0),
    [filteredMenu],
  );

  const toggleGroup = (key: string, currentValue: boolean) => {
    setExpansion((current) => ({
      pathname,
      values: {
        ...(current.pathname === pathname ? current.values : {}),
        [key]: !currentValue,
      },
    }));
  };

  const collapseAll = () => {
    const newVals: Record<string, boolean> = {};
    menu.forEach((g) => { newVals[g.key] = false; });
    setExpansion({ pathname, values: newVals });
  };

  const expandAll = () => {
    const newVals: Record<string, boolean> = {};
    menu.forEach((g) => { newVals[g.key] = true; });
    setExpansion({ pathname, values: newVals });
  };

  const dashboardHref = financeDashboardPath(prefix);
  const dashboardActive = pathname === dashboardHref;

  return (
    <div className="space-y-1">
      {/* Quick Search & Filter in Sidebar */}
      <div className="px-1 pt-0.5 pb-1">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search finance pages..."
              className="h-7 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] pl-7 pr-6 text-[11px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-all duration-150 focus:border-amber-400/50 focus:bg-white/[0.07] focus:ring-1 focus:ring-amber-400/30"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={query ? collapseAll : Object.values(expansion.values).some(Boolean) ? collapseAll : expandAll}
            title={Object.values(expansion.values).some(Boolean) ? 'Collapse all groups' : 'Expand all groups'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200"
          >
            {Object.values(expansion.values).some(Boolean) ? (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {query && (
          <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-zinc-400">
            <span>{totalFilteredItems} pages found</span>
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="text-amber-400 hover:underline"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Finance Dashboard Home Link */}
      {showDashboard && !query ? (
        <Link
          href={dashboardHref}
          onClick={onNavigate}
          className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150 ${
            dashboardActive
              ? 'bg-gradient-to-r from-amber-400/20 via-amber-400/5 to-transparent text-[#FFC107] font-semibold border-l-[3px] border-[#FFC107] shadow-2xs'
              : 'border-l-[3px] border-transparent text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.05] font-medium'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <LayoutDashboard className={`h-3.5 w-3.5 shrink-0 ${dashboardActive ? 'text-[#FFC107]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
            <span className="truncate">Finance Dashboard</span>
          </span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[9.5px] font-medium text-zinc-400">Home</span>
        </Link>
      ) : null}

      {/* Module Groups */}
      <div className="space-y-0.5">
        {filteredMenu.map((group) => {
          const Icon = groupIcons[group.key] ?? BookOpen;
          const isGroupActive = group.items.some((item) => isUnder(item.href));
          const override = expansion.pathname === pathname ? expansion.values[group.key] : undefined;
          // If searching, automatically expand matching groups
          const isExpanded = query ? true : (override ?? isGroupActive);
          const groupBadge = group.items.reduce((sum, item) => sum + item.badge, 0);

          return (
            <div key={group.key} className="rounded-lg transition-colors">
              <button
                type="button"
                onClick={() => toggleGroup(group.key, isExpanded)}
                aria-expanded={isExpanded}
                className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-all duration-150 ${
                  isGroupActive
                    ? 'bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent text-[#FFC107] font-semibold border-l-[3px] border-[#FFC107]'
                    : 'border-l-[3px] border-transparent text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] font-medium'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${isGroupActive ? 'text-[#FFC107]' : 'text-zinc-400 group-hover:text-zinc-200'}`} />
                  <span className="truncate">{group.label}</span>
                </span>
                <span className="ml-1.5 flex shrink-0 items-center gap-1.5">
                  {!isExpanded && groupBadge > 0 ? (
                    <span className="min-w-[1.15rem] rounded-full bg-rose-500 px-1.5 py-0.2 text-center text-[9.5px] font-bold text-white">
                      {groupBadge > 99 ? '99+' : groupBadge}
                    </span>
                  ) : (
                    <span className="rounded bg-white/[0.05] px-1.5 py-0.2 text-[9.5px] font-medium text-zinc-400">
                      {group.items.length}
                    </span>
                  )}
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    } ${isGroupActive ? 'text-[#FFC107]' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                  />
                </span>
              </button>

              {isExpanded ? (
                <div className="my-0.5 ml-3 space-y-0.5 border-l border-white/[0.08] pl-2">
                  {group.items.map((item) => {
                    const active = isUnder(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={`group flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] transition-all duration-150 ${
                          active
                            ? 'bg-[#FFC107]/15 font-semibold text-[#FFC107]'
                            : 'font-normal text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all ${
                              active
                                ? 'bg-[#FFC107] shadow-[0_0_8px_#FFC107]'
                                : 'bg-zinc-600 group-hover:bg-zinc-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge > 0 ? (
                          <span className="min-w-[1.1rem] rounded-full bg-rose-500 px-1 py-0.2 text-center text-[9px] font-bold text-white">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
