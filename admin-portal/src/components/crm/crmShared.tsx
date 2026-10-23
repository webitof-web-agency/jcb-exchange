'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Database,
  FileUp,
  Flame,
  Globe,
  Inbox,
  Kanban,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Phone,
  PhoneCall,
  Snowflake,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
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
  enquiryType?: string | null;
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

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  NEW: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/90', dot: 'bg-blue-500' },
  CONTACTED: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200/90', dot: 'bg-slate-500' },
  QUALIFIED: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/90', dot: 'bg-purple-500' },
  INTERESTED: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/90', dot: 'bg-indigo-500' },
  INSPECTION_SCHEDULED: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/90', dot: 'bg-amber-500' },
  NEGOTIATION: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200/90', dot: 'bg-orange-500' },
  ON_HOLD: { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200/90', dot: 'bg-zinc-400' },
  WON: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/90', dot: 'bg-emerald-500' },
  LOST: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/90', dot: 'bg-rose-500' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.CONTACTED;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-tight border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <span>{label(status)}</span>
    </span>
  );
}

export function TemperatureBadge({ temperature, score }: { temperature: string; score?: number }) {
  const meta =
    temperature === 'HOT'
      ? { icon: <Flame className="h-3 w-3 text-rose-500 fill-rose-500/20" />, cls: 'bg-rose-50 text-rose-700 border-rose-200/80' }
      : temperature === 'COLD'
      ? { icon: <Snowflake className="h-3 w-3 text-sky-500" />, cls: 'bg-sky-50 text-sky-700 border-sky-200/80' }
      : { icon: <Sun className="h-3 w-3 text-amber-500" />, cls: 'bg-amber-50 text-amber-800 border-amber-200/80' };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${meta.cls}`}
      title={score !== undefined ? `Score ${score}/100` : undefined}
    >
      {meta.icon}
      <span>{label(temperature)}</span>
      {score !== undefined ? <span className="opacity-70 font-semibold">· {score}</span> : null}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const toneCls =
    priority === 'URGENT'
      ? 'bg-red-50 text-red-700 border-red-200'
      : priority === 'HIGH'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : priority === 'LOW'
      ? 'bg-slate-50 text-slate-600 border-slate-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${toneCls}`}>
      {label(priority)}
    </span>
  );
}

export function EnquiryChannelBadge({
  enquiryType,
  tags = [],
}: {
  enquiryType?: string | null;
  tags?: string[];
}) {
  const raw = (enquiryType || '').toUpperCase();
  const hasCall = tags.includes('Call') || (raw.includes('CALL') && !raw.includes('CALLBACK'));
  const hasWhatsApp = tags.includes('WhatsApp') || raw.includes('WHATSAPP');
  const hasCallback = tags.includes('Callback') || raw.includes('CALLBACK');
  const isRepeat = tags.includes('Repeat Enquiry');

  const channels: Array<{ key: string; label: string; icon: 'call' | 'wa' | 'cb'; color: string }> = [];
  if (hasCall) {
    channels.push({
      key: 'call',
      label: 'Call',
      icon: 'call',
      color: 'bg-blue-50 text-blue-700 border-blue-200/90',
    });
  }
  if (hasWhatsApp) {
    channels.push({
      key: 'wa',
      label: 'WhatsApp',
      icon: 'wa',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
    });
  }
  if (hasCallback) {
    channels.push({
      key: 'cb',
      label: 'Callback',
      icon: 'cb',
      color: 'bg-amber-50 text-amber-800 border-amber-200/90',
    });
  }

  if (channels.length > 0) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {channels.map((c) => (
          <span
            key={c.key}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${c.color}`}
          >
            {c.icon === 'call' ? (
              <Phone className="h-2.5 w-2.5 text-blue-600" />
            ) : c.icon === 'wa' ? (
              <MessageSquare className="h-2.5 w-2.5 text-emerald-600" />
            ) : (
              <PhoneCall className="h-2.5 w-2.5 text-amber-600" />
            )}
            {c.label}
          </span>
        ))}
        {isRepeat ? (
          <span
            className="inline-flex items-center rounded-md bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 text-[9px] font-bold tracking-tight"
            title="Customer submitted repeat enquiries"
          >
            Repeat
          </span>
        ) : null}
      </div>
    );
  }

  if (raw.includes('FORM') || raw.includes('ENQUIRY')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200/90 px-1.5 py-0.5 text-[10px] font-bold">
        <Sparkles className="h-2.5 w-2.5 text-purple-600" />
        Web Form
      </span>
    );
  }
  if (raw.includes('PRIME')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/90 px-1.5 py-0.5 text-[10px] font-bold">
        <Sparkles className="h-2.5 w-2.5 text-indigo-600" />
        Prime Request
      </span>
    );
  }
  if (enquiryType) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold">
        <Globe className="h-2.5 w-2.5 text-slate-500" />
        {label(enquiryType)}
      </span>
    );
  }
  return null;
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
  const prefix = pathname.startsWith('/superadmin')
    ? '/superadmin'
    : pathname.startsWith('/admin')
      ? '/admin'
      : '/employee';
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
      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-2xs">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-bold">CRM database is not installed yet</p>
          <p className="mt-1 text-xs leading-5 text-amber-700">The CRM migration has not been applied to this database. Enquiries keep arriving and are stored; CRM screens open once the migration is deployed.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-2xs">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
      <p className="font-semibold">{message}</p>
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

export const selectClass =
  'w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20';
/** Same look without w-full, for toolbar filters that set their own width. */
export const compactSelectClass =
  'rounded-xl border border-slate-200/90 bg-slate-50/70 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20';
export const chipClass = (active: boolean) =>
  `shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-150 ${
    active ? 'border-slate-900 bg-slate-900 text-white shadow-2xs' : 'border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
  }`;

// ───────────── Page frame & Quick Nav ─────────────

function MetaGate({ children }: { children: ReactNode }) {
  const { meta } = useCrmMeta();
  if (!meta) return <LoadingState label="Loading CRM workspace…" />;
  return <>{children}</>;
}

export function CrmNavBar() {
  const { base, isPartnerPortal } = useCrmBase();
  const pathname = usePathname() || '';

  const links = [
    { href: base, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: `${base}/leads`, label: 'Leads', icon: Inbox },
    { href: `${base}/pipeline`, label: 'Pipeline', icon: Kanban },
    { href: `${base}/follow-ups`, label: 'Follow-ups', icon: PhoneCall },
    ...(!isPartnerPortal
      ? [
          { href: `${base}/contacts`, label: 'Contacts', icon: Users },
          { href: `${base}/reports`, label: 'Reports', icon: BarChart3 },
          { href: `${base}/campaigns`, label: 'Campaigns', icon: Megaphone },
          { href: `${base}/import`, label: 'Import', icon: FileUp },
        ]
      : []),
  ];

  return (
    <nav className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xs custom-scrollbar">
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`inline-flex items-center gap-1.5 shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-150 ${
              isActive
                ? 'bg-slate-950 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Every CRM page: meta provider + full-width canvas. */
export function CrmPageFrame({ children }: { children: ReactNode }) {
  return (
    <CrmMetaProvider>
      <div className="w-full max-w-7xl mx-auto space-y-4 pb-12">
        <MetaGate>{children}</MetaGate>
      </div>
    </CrmMetaProvider>
  );
}

/** Page title block: executive command banner with actions. */
export function PageHeader({
  title,
  description,
  actions,
  badgeText,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  badgeText?: string;
}) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Enterprise CRM
          </span>
          {badgeText ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {badgeText}
            </span>
          ) : null}
        </div>
        <h1 className="mt-1 text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-xs text-slate-500 max-w-3xl truncate sm:whitespace-normal">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

/** Compact KPI tile used on dashboard, reports and overview strips. */
export function StatTile({
  label: text,
  value,
  hint,
  tone = 'text-slate-900',
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <div className="group relative flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{text}</p>
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-600 border border-slate-100 group-hover:bg-amber-50 group-hover:text-amber-700 group-hover:border-amber-200/60 transition-colors">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <p className={`text-xl sm:text-2xl font-bold tracking-tight leading-none ${tone}`}>{value}</p>
        {hint ? <p className="mt-1 text-[11px] font-medium text-slate-500 truncate">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** CRM page URLs under the role prefix (`base` = /superadmin/crm …). */
export const crmPath = (
  base: string,
  page: '' | 'leads' | 'pipeline' | 'follow-ups' | 'contacts' | 'reports' | 'campaigns' | 'import',
  query?: string,
) => `${base}${page ? `/${page}` : ''}${query ? `?${query}` : ''}`;

export const settingsPath = (base: string) => `${base.replace(/\/crm$/, '')}/settings?tab=crm`;

export const CONTACT_TYPES = ['BUYER', 'SELLER', 'DEALER', 'BROKER', 'FINANCIER', 'TRANSPORTER', 'CONTRACTOR', 'OTHER'];

export const requirementSummary = (
  lead: Pick<LeadRow, 'listingTitleSnapshot' | 'budgetMax' | 'budgetMin' | 'requirementCity' | 'message'>,
) =>
  lead.listingTitleSnapshot ||
  [lead.budgetMax ? `Budget ${fmtInr(lead.budgetMax)}` : null, lead.requirementCity].filter(Boolean).join(' · ') ||
  lead.message?.slice(0, 70) ||
  '—';
