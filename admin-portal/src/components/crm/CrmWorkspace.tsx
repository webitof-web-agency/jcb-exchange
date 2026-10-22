'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, CalendarClock, Contact, Columns3, FileUp, LayoutDashboard, ListChecks, Megaphone, Settings } from 'lucide-react';
import { LoadingState } from '@/components/financeWorkspace/ui';
import { CrmMetaProvider, useCrmBase, useCrmMeta, type CrmMeta } from './crmShared';

const loading = () => <LoadingState />;
const DashboardTab = dynamic(() => import('./DashboardTab'), { loading });
const LeadsTab = dynamic(() => import('./LeadsTab'), { loading });
const PipelineTab = dynamic(() => import('./PipelineTab'), { loading });
const FollowUpsTab = dynamic(() => import('./FollowUpsTab'), { loading });
const ContactsTab = dynamic(() => import('./ContactsTab'), { loading });
const ReportsTab = dynamic(() => import('./ReportsTab'), { loading });
const CampaignsTab = dynamic(() => import('./CampaignsTab'), { loading });
const ImportTab = dynamic(() => import('./ImportTab'), { loading });
const SettingsTab = dynamic(() => import('./SettingsTab'), { loading });

type TabDef = { key: string; label: string; icon: typeof LayoutDashboard; visible: (a: CrmMeta['access']) => boolean; Screen: ComponentType };

const TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: () => true, Screen: DashboardTab },
  { key: 'leads', label: 'Leads', icon: ListChecks, visible: () => true, Screen: LeadsTab },
  { key: 'pipeline', label: 'Pipeline', icon: Columns3, visible: () => true, Screen: PipelineTab },
  { key: 'followups', label: 'Follow-ups', icon: CalendarClock, visible: () => true, Screen: FollowUpsTab },
  { key: 'contacts', label: 'Contacts', icon: Contact, visible: (a) => !a.isPartner, Screen: ContactsTab },
  { key: 'reports', label: 'Reports', icon: BarChart3, visible: (a) => a.canReports, Screen: ReportsTab },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, visible: (a) => a.canCampaigns, Screen: CampaignsTab },
  { key: 'import', label: 'Import', icon: FileUp, visible: (a) => a.canImport, Screen: ImportTab },
  { key: 'settings', label: 'Settings', icon: Settings, visible: (a) => a.canSettings, Screen: SettingsTab },
];

function Workspace() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const params = useSearchParams();
  if (!meta) return <LoadingState label="Loading CRM…" />;
  const tabs = TABS.filter((t) => t.visible(meta.access));
  const active = tabs.find((t) => t.key === params.get('tab')) || tabs[0]!;
  const Screen = active.Screen;
  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600">Sales & relationships</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">CRM & Follow-ups</h1>
            <p className="mt-1 text-xs text-slate-500">{meta.access.canSeeAll ? 'All leads across the team.' : meta.access.isPartner ? 'Leads routed to your business.' : 'Your assigned leads and follow-ups.'}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto" aria-label="CRM sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const on = tab.key === active.key;
              return (
                <button key={tab.key} type="button" onClick={() => router.replace(`${base}?tab=${tab.key}`)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${on ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Icon className="h-4 w-4" />{tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <Screen key={`${active.key}-${params.toString()}`} />
      </div>
    </div>
  );
}

export default function CrmWorkspace() {
  return <CrmMetaProvider><Workspace /></CrmMetaProvider>;
}
