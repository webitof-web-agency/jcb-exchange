'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { HrmChecklistItem } from '@/lib/hrmApi';
import { CHECKLIST_STATE_LABELS, checklistStateClass } from '@/lib/hrmProfile';
import type { ProfileTab } from '@/lib/hrmProfileTabs';

/** The profile's section tabs, with how many joining items are still open on each. */
export default function HrmProfileTabs({
  tabs,
  active,
  openCounts,
  onSelect,
}: {
  tabs: ReadonlyArray<{ id: ProfileTab; label: string }>;
  active: ProfileTab;
  openCounts: Partial<Record<ProfileTab, number>>;
  onSelect: (tab: ProfileTab) => void;
}) {
  const barRef = useRef<HTMLElement | null>(null);
  // On a narrow screen the chosen tab is scrolled into view.
  useEffect(() => {
    barRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <nav ref={barRef} className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Employee sections">
      {tabs.map((tab) => {
        const count = openCounts[tab.id] ?? 0;
        const selected = active === tab.id;
        return (
          <button key={tab.id} type="button" aria-current={selected ? 'page' : undefined} onClick={() => onSelect(tab.id)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {tab.label}
            {count ? <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-950' : 'bg-rose-100 text-rose-700'}`} aria-label={`${count} to complete`}>{count}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Above a section opened from the joining checklist: back to the list, this item's state, and the next one. */
export function HrmChecklistFocusBar({
  item,
  next,
  onBack,
  onNext,
  onShowAll,
  sectionLabel,
}: {
  item: HrmChecklistItem;
  next: HrmChecklistItem | null;
  onBack: () => void;
  onNext: (item: HrmChecklistItem) => void;
  onShowAll: () => void;
  sectionLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={onBack} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-amber-100"><ArrowLeft className="h-3.5 w-3.5" /> Checklist</button>
        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${checklistStateClass(item.state)}`}>{item.state === 'DONE' ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}{CHECKLIST_STATE_LABELS[item.state]}</span>
        <button type="button" onClick={onShowAll} className="text-xs font-semibold text-amber-800 underline hover:no-underline">Show all of {sectionLabel}</button>
      </div>
      {next ? <button type="button" onClick={() => onNext(next)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800">Next: {next.label} <ArrowRight className="h-3.5 w-3.5" /></button> : null}
    </div>
  );
}
