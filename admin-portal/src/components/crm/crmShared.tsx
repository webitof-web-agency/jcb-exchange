'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Database, Flame, Snowflake, Sun } from 'lucide-react';
import api from '@/lib/api';
import { Badge, LoadingState } from '@/components/financeWorkspace/ui';

// Shared client code for the CRM workspace (backend: /crm/*, docs/crm/00_CRM_PLAN.md).

export const CRM_SCHEMA_MISSING_CODE = 'CRM_SCHEMA_MISSING';
type ApiError = { response?: { status?: number; data?: { error?: string; code?: string; details?: { code?: string; leadId?: string } } } };

export const crmError = (error: unknown, fallback: string) => (error as ApiError)?.response?.data?.error || fallback;
export const crmErrorCode = (error: unknown) => (error as ApiError)?.response?.data?.details?.code || (error as ApiError)?.response?.data?.code || null;
export const crmErrorDetails = (error: unknown) => (error as ApiError)?.response?.data?.details;
const isSchemaMissing = (error: unknown) => (error as ApiError)?.response?.data?.code === CRM_SCHEMA_MISSING_CODE;

export type Staff = { id: string; name: string; role: string; roleName: string | null };
export type ContactLite = { id: string; name: string | null; mobile: string | null; email: string | null; whatsappNumber: string | null; city: string | null; state: string | null; role: string };

export type CrmMeta = {
  access: { isPartner: boolean; canManage: boolean; canSeeAll: boolean; canAssign: boolean; canReports: boolean; canExport: boolean; canImport: boolean; canCampaigns: boolean; canSettings: boolean };
  me: string;
  config: {
    sources: string[];
    lostReasons: string[];
    tags: string[];
    requireNextFollowUp: boolean;
    workingHours?: { start: string; end: string; days: number[] };
    sla?: Record<string, number>;
    reminders?: { minutesBefore: number; inApp: boolean; push: boolean; whatsappToOwner: boolean; smsToOwner: boolean };
    missed?: { graceMinutes: number; escalate: boolean; managerUserIds: string[] };
    automation?: Record<string, boolean | number>;
    publicForms?: { enabled: boolean };
    webhook?: { enabled: boolean; configured: boolean; keyHint: string | null };
  };
  staff: Staff[];
  enums: { statuses: string[]; leadTypes: string[]; priorities: string[]; temperatures: string[]; followUpTypes: string[]; outcomes: string[]; lifecycles: string[] };
  automation: Record<string, unknown> | null;
};

export type LeadRow = {
  id: string;
  status: string;
  leadType: string;
  source: string;
  priority: string;
  temperature: string;
  score: number;
  message: string | null;
  createdAt: string;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  firstResponseAt: string | null;
  slaDueAt: string | null;
  slaBreachedAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  tags: string[];
  expectedValue: number | null;
  wonAmount: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  requirementCity: string | null;
  requirementState: string | null;
  listingId: string | null;
  listingTitleSnapshot: string | null;
  listingPriceSnapshot: number | null;
  customer: ContactLite;
  owner: { id: string; name: string | null; role: string } | null;
  dealer: { id: string; name: string | null; role: string };
};

export type FollowUp = {
  id: string;
  leadId: string | null;
  contactUserId: string;
  ownerId: string | null;
  type: string;
  status: string;
  dueAt: string;
  title: string | null;
  notes: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  completedAt: string | null;
  rescheduleCount: number;
  lastRescheduleReason: string | null;
  autoCreated: boolean;
  owner?: { id: string; name: string | null } | null;
  contact?: ContactLite;
  lead?: { id: string; status: string; leadType: string; priority: string; temperature: string; listingTitleSnapshot: string | null } | null;
};

// ───────────── Labels ─────────────

export const label = (value: string | null | undefined) =>
  value ? value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '—';

export const LEAD_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy machine', SELL: 'Sell machine', FINANCE: 'Finance / Loan', INSURANCE: 'Insurance', RTO: 'RTO / Transfer', TRANSPORT: 'Transport',
  DEALER_ONBOARDING: 'Dealer onboarding', PRIME: 'Prime membership', VERIFICATION: 'Verification services', OTHER: 'Other',
};

export const OUTCOME_LABELS: Record<string, string> = {
  CONNECTED: 'Connected', NOT_REACHABLE: 'Not reachable', BUSY: 'Busy', SWITCHED_OFF: 'Switched off', CALL_BACK_LATER: 'Call back later',
  INTERESTED: 'Interested', NOT_INTERESTED: 'Not interested', WRONG_NUMBER: 'Wrong number', VISITED: 'Visited', NO_SHOW: 'No show', MESSAGE_SENT: 'Message sent', OTHER: 'Other',
};

const STATUS_TONES: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet'> = {
  NEW: 'blue', CONTACTED: 'slate', QUALIFIED: 'violet', INTERESTED: 'violet', INSPECTION_SCHEDULED: 'amber', NEGOTIATION: 'amber', ON_HOLD: 'slate', WON: 'green', LOST: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] || 'slate'}>{label(status)}</Badge>;
}

export function TemperatureBadge({ temperature, score }: { temperature: string; score?: number }) {
  const meta = temperature === 'HOT'
    ? { icon: <Flame className="h-3 w-3" />, cls: 'bg-red-50 text-red-700' }
    : temperature === 'COLD'
      ? { icon: <Snowflake className="h-3 w-3" />, cls: 'bg-sky-50 text-sky-700' }
      : { icon: <Sun className="h-3 w-3" />, cls: 'bg-amber-50 text-amber-700' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`} title={score !== undefined ? `Score ${score}/100` : undefined}>
      {meta.icon}{label(temperature)}{score !== undefined ? ` · ${score}` : ''}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === 'URGENT' ? 'red' : priority === 'HIGH' ? 'amber' : priority === 'LOW' ? 'slate' : 'blue';
  return <Badge tone={tone}>{label(priority)}</Badge>;
}

// ───────────── Dates (shown in IST) ─────────────

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (value: string | null | undefined) => (value ? dateTimeFormat.format(new Date(value)) : '—');
export const fmtDate = (value: string | null | undefined) => (value ? dateFormat.format(new Date(value)) : '—');
export const fmtInr = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

/** "in 2h" / "3d ago" relative to now, for follow-up urgency. */
export const relative = (value: string | null | undefined, now: number) => {
  if (!value) return '';
  const diff = new Date(value).getTime() - now;
  const abs = Math.abs(diff);
  const text = abs < 3600000 ? `${Math.max(1, Math.round(abs / 60000))}m` : abs < 86400000 ? `${Math.round(abs / 3600000)}h` : `${Math.round(abs / 86400000)}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
};

/** Value for <input type="datetime-local"> in the browser's local time. */
export const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : '');

/** Quick picks for the next follow-up time. */
export const quickTimes = () => {
  const now = new Date();
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
  const later = new Date(now.getTime() + 2 * 3600000);
  return [
    { label: 'In 2 hours', value: toLocalInput(later) },
    { label: 'Tomorrow 10 AM', value: toLocalInput(at(1, 10)) },
    { label: 'In 3 days', value: toLocalInput(at(3, 11)) },
    { label: 'Next week', value: toLocalInput(at(7, 11)) },
  ];
};

export const phoneLinks = (mobile: string | null | undefined, whatsapp?: string | null) => {
  const digits = (whatsapp || mobile || '').replace(/\D/g, '');
  const ten = digits.slice(-10);
  return {
    tel: mobile ? `tel:${mobile.replace(/\s/g, '')}` : null,
    wa: ten.length === 10 ? `https://wa.me/91${ten}` : null,
  };
};

// ───────────── Routing ─────────────

export const useCrmBase = () => {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/partner')) return { base: '/partner', isPartnerPortal: true };
  const prefix = pathname.startsWith('/superadmin') ? '/superadmin' : pathname.startsWith('/admin') ? '/admin' : '/employee';
  return { base: `${prefix}/crm`, isPartnerPortal: false };
};

export const leadHref = (base: string, id: string) => (base === '/partner' ? `/partner/leads/${id}` : `${base}/leads/${id}`);
export const contactHref = (base: string, id: string) => `${base}/contacts/${id}`;

// ───────────── Data ─────────────

type ResourceState<T> = { data: T | undefined; loading: boolean; error: string; schemaMissing: boolean };

/** Loads a CRM resource; `reload()` refetches. */
export function useCrmResource<T>(loader: () => Promise<T>, key: string) {
  const [state, setState] = useState<ResourceState<T>>({ data: undefined, loading: true, error: '', schemaMissing: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: '', schemaMissing: false }); })
      .catch((error) => { if (!cancelled) setState((previous) => ({ ...previous, loading: false, error: crmError(error, 'Could not load this section.'), schemaMissing: isSchemaMissing(error) })); });
    return () => { cancelled = true; };
    // `key` captures everything the loader depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}

export const getJson = async <T,>(url: string, params?: Record<string, unknown>) => (await api.get(url, params ? { params } : undefined)).data as T;

export function CrmErrorBanner({ message, schemaMissing }: { message: string; schemaMissing?: boolean }) {
  if (schemaMissing) {
    return (
      <div className="m-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Database className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">CRM database is not installed yet</p>
          <p className="mt-1 text-xs leading-5">The CRM migration has not been applied to this database. Enquiries keep arriving and are stored; CRM screens open once the migration is deployed.</p>
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

const MetaContext = createContext<{ meta: CrmMeta | undefined; reloadMeta: () => void }>({ meta: undefined, reloadMeta: () => undefined });

export function CrmMetaProvider({ children }: { children: ReactNode }) {
  const resource = useCrmResource(() => getJson<CrmMeta>('/crm/meta'), 'crm-meta');
  if (resource.error) return <CrmErrorBanner message={resource.error} schemaMissing={resource.schemaMissing} />;
  return <MetaContext.Provider value={{ meta: resource.data, reloadMeta: resource.reload }}>{children}</MetaContext.Provider>;
}

export const useCrmMeta = () => useContext(MetaContext);

export const staffName = (meta: CrmMeta | undefined, id: string | null | undefined) =>
  !id ? 'Unassigned' : meta?.staff.find((s) => s.id === id)?.name || (id === meta?.me ? 'Me' : 'Staff');

export const selectClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-400 focus:bg-white';
/** Same look without w-full, for toolbar filters that set their own width. */
export const compactSelectClass = 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400 focus:bg-white';
export const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;

// ───────────── Page frame ─────────────

function MetaGate({ children }: { children: ReactNode }) {
  const { meta } = useCrmMeta();
  if (!meta) return <LoadingState label="Loading CRM…" />;
  return <>{children}</>;
}

/** Every CRM page: meta provider + full-width canvas (pages fill wide screens, stack on phones). */
export function CrmPageFrame({ children }: { children: ReactNode }) {
  return (
    <CrmMetaProvider>
      <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1800px] space-y-5">
          <MetaGate>{children}</MetaGate>
        </div>
      </div>
    </CrmMetaProvider>
  );
}

/** Page title block: eyebrow, 24px title, one-line description, actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600">CRM</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Compact KPI tile used on the dashboard and reports. */
export function StatTile({ label: text, value, hint, tone = 'text-slate-900', href, icon }: { label: string; value: ReactNode; hint?: string; tone?: string; href?: string; icon?: ReactNode }) {
  const body = (
    <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <div>
        <p className={`text-[28px] font-bold leading-none ${tone}`}>{value}</p>
        {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** CRM page URLs under the role prefix (`base` = /superadmin/crm …). */
export const crmPath = (base: string, page: '' | 'leads' | 'pipeline' | 'follow-ups' | 'contacts' | 'reports' | 'campaigns' | 'import', query?: string) =>
  `${base}${page ? `/${page}` : ''}${query ? `?${query}` : ''}`;

export const settingsPath = (base: string) => `${base.replace(/\/crm$/, '')}/settings?tab=crm`;

export const CONTACT_TYPES = ['BUYER', 'SELLER', 'DEALER', 'BROKER', 'FINANCIER', 'TRANSPORTER', 'CONTRACTOR', 'OTHER'];

export const requirementSummary = (lead: Pick<LeadRow, 'listingTitleSnapshot' | 'budgetMax' | 'budgetMin' | 'requirementCity' | 'message'>) =>
  lead.listingTitleSnapshot
  || [lead.budgetMax ? `Budget ${fmtInr(lead.budgetMax)}` : null, lead.requirementCity].filter(Boolean).join(' · ')
  || lead.message?.slice(0, 70)
  || '—';
