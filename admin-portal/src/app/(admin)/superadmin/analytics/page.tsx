'use client';

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, AlertCircle, Award, BarChart3, ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, Filter, Layers, PackageCheck, RefreshCw, Search, ShoppingBag,
  Sparkles, TrendingDown, TrendingUp, Users, Wallet, X, Zap,
} from 'lucide-react';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { generateAdminListingDetailPath } from '@/lib/routePaths';

type Kpi = { current: number; previous: number; difference: number; percentageChange: number | null; trend: 'up' | 'down' | 'flat' };
type ModelYearRow = { brand: string; model: string; manufacturingYear: number; inventory: number; views: number; leads: number; wonLeads: number; conversionRate: number; demandPerStock: number | null };
type AnalyticsDimensions = { brandId: string; modelId: string; categoryId: string; partnerId: string; countryId: string; stateId: string; cityId: string; manufacturingYear: string; listingStatus: string; leadStatus: string; listingId: string };
type AnalyticsOptions = { brands: Option[]; models: Array<Option & { brandId: string }>; categories: Option[]; partners: Option[]; years: number[]; listings: Option[]; listingStatuses: string[]; leadStatuses: string[]; countries: Array<Option & { emoji?: string | null }> };
type AnalyticsResponse = {
  summary: { liveListings: number; liveInventoryValue: number; trackedViews: Kpi; leads: Kpi; activeLeads: number; wonLeads: number; conversionRate: number; trackedSearches: number; trackedZeroResultSearches: number; soldCount: number; soldValue: number; paymentCount: number; paymentAmount: number; primeSubscriptionCount: number; primeSubscriptionAmount: number; depositCount: number; depositAmount: number };
  listingStatusBreakdown: Array<{ status: string; count: number }>;
  leadStatusBreakdown: Array<{ status: string; count: number }>;
  modelYear: ModelYearRow[];
  topListings: Array<{ id: string; title: string; status: string; price: number; views: number; leads: number; manufacturingYear: number; brand?: { name: string } | null; model?: { name: string } | null; location: string; partner: string; partnerType?: string; isPrime?: boolean }>;
  financialAvailability: Record<string, string>;
  trackingAvailability: { earliestTrackedEventAt: string | null; historicalViewTrend: string; legacyAggregateViews: string };
  reconciliation: { status: string; missingInvoiceNumberSaleRecords: number };
};

const labelify = (v?: string | null) => (v || '—').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
const fmt = (v?: number | string | null) => v === undefined || v === null || v === '' ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(v) || 0);
const fmtCurrency = (v?: number | null) => v === undefined || v === null ? '—' : '₹' + fmt(v);
const getInitialDimensions = (p: URLSearchParams): AnalyticsDimensions => ({ brandId: p.get('brandId') || '', modelId: p.get('modelId') || '', categoryId: p.get('categoryId') || '', partnerId: p.get('partnerId') || '', countryId: p.get('countryId') || '', stateId: p.get('stateId') || '', cityId: p.get('cityId') || '', manufacturingYear: p.get('manufacturingYear') || '', listingStatus: p.get('listingStatus') || '', leadStatus: p.get('leadStatus') || '', listingId: p.get('listingId') || '' });
const toAnalyticsParams = (from: string, to: string, d: AnalyticsDimensions) => ({ from, to, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim())) });
const withAllOption = (text: string, options: Option[]) => [{ id: '', name: text }, ...options];

const STATUS_STYLES: Record<string, string> = { PUBLISHED: 'border-emerald-200 bg-emerald-50 text-emerald-800', DRAFT: 'border-slate-200 bg-slate-100 text-slate-700', PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-800', CHANGES_REQUESTED: 'border-orange-200 bg-orange-50 text-orange-800', PAUSED: 'border-slate-200 bg-slate-100 text-slate-600', RESERVED: 'border-blue-200 bg-blue-50 text-blue-800', SOLD: 'border-violet-200 bg-violet-50 text-violet-800', REJECTED: 'border-rose-200 bg-rose-50 text-rose-800' };
const LEAD_STYLES: Record<string, string> = { NEW: 'border-blue-200 bg-blue-50 text-blue-800', CONTACTED: 'border-indigo-200 bg-indigo-50 text-indigo-800', INTERESTED: 'border-violet-200 bg-violet-50 text-violet-800', INSPECTION_SCHEDULED: 'border-amber-200 bg-amber-50 text-amber-800', WON: 'border-emerald-200 bg-emerald-50 text-emerald-800', LOST: 'border-rose-200 bg-rose-50 text-rose-800' };
const LEAD_BAR: Record<string, string> = { NEW: 'bg-blue-500', CONTACTED: 'bg-indigo-500', INTERESTED: 'bg-violet-500', INSPECTION_SCHEDULED: 'bg-amber-500', WON: 'bg-emerald-500', LOST: 'bg-rose-500' };

function StatusBadge({ value, type = 'listing' }: { value?: string | null; type?: 'listing' | 'lead' }) {
  const s = type === 'lead' ? (LEAD_STYLES[value || ''] || 'border-slate-200 bg-slate-100 text-slate-700') : (STATUS_STYLES[value || ''] || 'border-slate-200 bg-slate-100 text-slate-700');
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${s}`}>{labelify(value)}</span>;
}

function SectionHeading({ icon, eyebrow, title, detail, action }: { icon: ReactNode; eyebrow?: string; title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#9a6b00]">{icon}</span>
        <div>
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a47400]">{eyebrow}</p> : null}
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">{title}</h2>
          {detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function KpiCard({ icon, label, value, note, trend, change, accent = 'amber' }: { icon: ReactNode; label: string; value: string; note: string; trend?: 'up' | 'down' | 'flat'; change?: number | null; accent?: 'amber' | 'blue' | 'green' | 'violet' | 'rose'; }) {
  const accents: Record<string, string> = { amber: 'bg-amber-50 text-[#9a6b00]', blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700', violet: 'bg-violet-50 text-violet-700', rose: 'bg-rose-50 text-rose-700' };
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accents[accent]}`}>{icon}</span>
        {trend && trend !== 'flat' && (<span className={`flex items-center gap-1 text-[11px] font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-rose-500'}`}><TrendIcon className="h-3 w-3" />{change !== null && change !== undefined ? (change > 0 ? '+' : '') + change + '%' : null}</span>)}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function EmptyRow({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="py-12 text-center text-xs font-semibold text-slate-400">No data to display</td></tr>; }

function PaginationFooter({ startItem, endItem, total, page, totalPages, pageSize, pageSizeOpen, paginationItems, onPageChange, onPageSizeChange, onPageSizeOpenChange, unit }: { startItem: number; endItem: number; total: number; page: number; totalPages: number; pageSize: number; pageSizeOpen: boolean; paginationItems: (number | '...')[]; unit: string; onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; onPageSizeOpenChange: (v: boolean) => void; }) {
  return (
    <div className="flex flex-col gap-3 border-x border-b border-slate-200 bg-white px-4 py-2.5 rounded-b-2xl sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <span>Showing <strong className="font-semibold text-slate-900">{startItem}</strong> to <strong className="font-semibold text-slate-900">{endItem}</strong> of <strong className="font-semibold text-slate-900">{total}</strong> {unit}</span>
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
          <span className="text-slate-500">Rows per page:</span>
          <div className="relative">
            <button type="button" onClick={() => onPageSizeOpenChange(!pageSizeOpen)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"><span>{pageSize}</span><ChevronDown className="h-3 w-3 text-slate-400" /></button>
            {pageSizeOpen && (<div className="absolute bottom-full left-0 z-20 mb-1 w-16 rounded-lg border border-slate-200 bg-white p-1 shadow-md">{[5, 10, 25, 50].map((size) => <button key={size} type="button" onClick={() => { onPageSizeChange(size); onPageSizeOpenChange(false); }} className={`block w-full rounded-md px-2 py-1 text-left text-xs ${pageSize === size ? 'bg-[#f7b500]/20 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}>{size}</button>)}</div>)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(Math.max(page - 1, 1))} disabled={page === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
        <div className="flex items-center gap-1">{paginationItems.map((item, idx) => typeof item === 'number' ? (<button key={item} type="button" onClick={() => onPageChange(item)} className={`h-7 w-7 rounded-lg text-xs font-bold transition-colors ${page === item ? 'bg-[#f7b500] text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{item}</button>) : (<span key={'el-' + idx} className="px-1 text-xs font-bold text-slate-400">...</span>))}</div>
        <button type="button" onClick={() => onPageChange(Math.min(page + 1, totalPages))} disabled={page === totalPages} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next <ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [dimensions, setDimensions] = useState<AnalyticsDimensions>(() => getInitialDimensions(searchParams));
  const [options, setOptions] = useState<AnalyticsOptions | null>(null);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(true);
  const [modelYearSearch, setModelYearSearch] = useState('');
  const [listingSearch, setListingSearch] = useState('');
  const [modelYearPage, setModelYearPage] = useState(1);
  const [modelYearPageSize, setModelYearPageSize] = useState(10);
  const [openModelYearPageSizeDropdown, setOpenModelYearPageSizeDropdown] = useState(false);
  const [listingPage, setListingPage] = useState(1);
  const [listingPageSize, setListingPageSize] = useState(10);
  const [openListingPageSizeDropdown, setOpenListingPageSizeDropdown] = useState(false);
  const [isModelYearCollapsed, setIsModelYearCollapsed] = useState(false);
  const [isListingCollapsed, setIsListingCollapsed] = useState(false);

  const filteredModelYear = useMemo(() => { const rows = data?.modelYear ?? []; if (!modelYearSearch.trim()) return rows; const q = modelYearSearch.toLowerCase(); return rows.filter((r) => (r.brand + ' ' + r.model + ' ' + r.manufacturingYear).toLowerCase().includes(q)); }, [data?.modelYear, modelYearSearch]);
  const filteredTopListings = useMemo(() => { const rows = data?.topListings ?? []; if (!listingSearch.trim()) return rows; const q = listingSearch.toLowerCase(); return rows.filter((l) => (l.title + ' ' + l.partner + ' ' + (l.partnerType || '') + ' ' + (l.brand?.name || '') + ' ' + (l.model?.name || '') + ' ' + (l.location || '') + ' ' + l.manufacturingYear).toLowerCase().includes(q)); }, [data?.topListings, listingSearch]);

  const totalModelYearItems = filteredModelYear.length;
  const totalModelYearPages = Math.ceil(totalModelYearItems / modelYearPageSize) || 1;
  const currentModelYearPage = Math.min(modelYearPage, totalModelYearPages);
  const paginatedModelYear = useMemo(() => filteredModelYear.slice((currentModelYearPage - 1) * modelYearPageSize, currentModelYearPage * modelYearPageSize), [filteredModelYear, currentModelYearPage, modelYearPageSize]);
  const modelYearPaginationItems = useMemo(() => buildPaginationItems(currentModelYearPage, totalModelYearPages), [currentModelYearPage, totalModelYearPages]);
  const totalListingItems = filteredTopListings.length;
  const totalListingPages = Math.ceil(totalListingItems / listingPageSize) || 1;
  const currentListingPage = Math.min(listingPage, totalListingPages);
  const paginatedTopListings = useMemo(() => filteredTopListings.slice((currentListingPage - 1) * listingPageSize, currentListingPage * listingPageSize), [filteredTopListings, currentListingPage, listingPageSize]);
  const listingPaginationItems = useMemo(() => buildPaginationItems(currentListingPage, totalListingPages), [currentListingPage, totalListingPages]);

  const updateDimension = (key: keyof AnalyticsDimensions, value: string) => setDimensions((d) => ({ ...d, [key]: value }));

  useEffect(() => { let cancelled = false; void api.get<AnalyticsOptions>('/analytics/options').then((r) => { if (!cancelled) { setOptions(r.data); setOptionsError(''); } }).catch(() => { if (!cancelled) setOptionsError('Some filter options could not be loaded.'); }).finally(() => { if (!cancelled) setOptionsLoading(false); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { let cancelled = false; if (!dimensions.countryId) return () => { cancelled = true; }; void api.get<Option[]>('/locations/states/' + dimensions.countryId).then((r) => { if (!cancelled) setStates(r.data || []); }).catch(() => { if (!cancelled) setStates([]); }); return () => { cancelled = true; }; }, [dimensions.countryId]);
  useEffect(() => { let cancelled = false; if (!dimensions.stateId) return () => { cancelled = true; }; void api.get<Option[]>('/locations/cities/' + dimensions.stateId).then((r) => { if (!cancelled) setCities(r.data || []); }).catch(() => { if (!cancelled) setCities([]); }); return () => { cancelled = true; }; }, [dimensions.stateId]);

  const load = async (nextFrom = from, nextTo = to, nextDimensions = dimensions) => { setLoading(true); setError(''); try { const r = await api.get<AnalyticsResponse>('/analytics/overview', { params: toAnalyticsParams(nextFrom, nextTo, nextDimensions) }); setData(r.data); } catch { setError('Analytics could not be loaded. Please try again.'); } finally { setLoading(false); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load(searchParams.get('from') || '', searchParams.get('to') || ''), 0); return () => window.clearTimeout(timer); }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); router.replace(pathname + '?' + new URLSearchParams(toAnalyticsParams(from, to, dimensions)).toString()); void load(from, to, dimensions); };
  const handleReset = () => { const empty = getInitialDimensions(new URLSearchParams()); setFrom(''); setTo(''); setStates([]); setCities([]); setDimensions(empty); setIsFilterCollapsed(true); router.replace(pathname); void load('', '', empty); };
  const handleExport = async () => { setExporting(true); setExportError(''); try { const r = await api.get<Blob>('/analytics/export/listings.csv', { params: toAnalyticsParams(from, to, dimensions), responseType: 'blob' }); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'jcb-analytics-' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); } catch { setExportError('CSV export failed. Please try again.'); } finally { setExporting(false); } };

  const listingPath = pathname.startsWith('/employee') ? '/employee/listings' : pathname.startsWith('/admin') ? '/admin/listings' : '/superadmin/listings';
  const analyticsBasePath = pathname.startsWith('/employee') ? '/employee/analytics' : '/superadmin/analytics';
  const brandOptions = withAllOption('All brands', options?.brands || []);
  const modelOptions = withAllOption('All models', options?.models.filter((m) => !dimensions.brandId || m.brandId === dimensions.brandId) || []);
  const countryOptions = withAllOption('All countries', options?.countries.map((c) => ({ id: c.id, name: ((c.emoji || '') + ' ' + c.name).trim() })) || []);
  const listingStatusOptions = withAllOption('All statuses', options?.listingStatuses.map((s) => ({ id: s, name: labelify(s) })) || []);
  const availableLeadStatuses = new Set(options?.leadStatuses || []);
  const leadStatusOptions = withAllOption('All lead statuses', [...(availableLeadStatuses.has('NEW') ? [{ id: 'OPEN', name: 'Open' }] : []), ...(availableLeadStatuses.has('CONTACTED') || availableLeadStatuses.has('INTERESTED') || availableLeadStatuses.has('INSPECTION_SCHEDULED') ? [{ id: 'ONGOING', name: 'Ongoing' }] : []), ...(availableLeadStatuses.has('WON') || availableLeadStatuses.has('LOST') ? [{ id: 'CLOSED', name: 'Closed' }] : []), ...(options?.leadStatuses || []).map((s) => ({ id: s, name: labelify(s) }))]);
  const activeFilterCount = useMemo(() => { let c = 0; if (from) c++; if (to) c++; c += Object.values(dimensions).filter((v) => Boolean(v?.trim())).length; return c; }, [from, to, dimensions]);
  const totalLeadCount = data ? data.leadStatusBreakdown.reduce((s, b) => s + b.count, 0) : 0;
  const totalListingCount = data ? data.listingStatusBreakdown.reduce((s, b) => s + b.count, 0) : 0;

  return (
    <main className="space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a6b00]"><Zap className="h-3 w-3" /> Decision workspace</div>
            <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">{t('admin.analyticsTitle', 'Advanced Analytics')}</h1>
            <p className="text-sm font-semibold text-slate-500">Platform-wide performance intelligence across listings, leads, and revenue.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button type="button" onClick={() => void handleExport()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400"><Download className="h-3.5 w-3.5" />{exporting ? 'Preparing…' : 'Export CSV'}</button>
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#f7b500] px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#ffc928] focus:outline-none focus:ring-2 focus:ring-amber-400"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
        {exportError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{exportError}</p>}
      </section>

      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all sm:w-40" />
            <span className="text-xs font-medium text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all sm:w-40" />
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-[#f7b500] px-4 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-[#ffc928] shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"><Search className="h-3.5 w-3.5" /> Apply</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsFilterCollapsed(!isFilterCollapsed)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"><Filter className="h-3.5 w-3.5 text-[#9a6b00]" />{isFilterCollapsed ? 'Filters' + (activeFilterCount > 0 ? ' (' + activeFilterCount + ')' : '') : 'Hide Filters'}<ChevronDown className={'h-3.5 w-3.5 text-slate-400 transition-transform ' + (isFilterCollapsed ? '' : 'rotate-180')} /></button>
            <button type="button" onClick={handleReset} className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors underline decoration-slate-300 underline-offset-4">Reset</button>
          </div>
        </div>
        {!isFilterCollapsed && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {([['brandId', brandOptions], ['modelId', modelOptions], ['categoryId', withAllOption('All categories', options?.categories || [])], ['partnerId', withAllOption('All partners', options?.partners || [])], ['manufacturingYear', withAllOption('All years', options?.years.map((y) => ({ id: y, name: String(y) })) || [])], ['listingStatus', listingStatusOptions], ['leadStatus', leadStatusOptions], ['listingId', withAllOption('All listings', options?.listings || [])]] as Array<[keyof AnalyticsDimensions, Option[]]>).map(([key, opts]) => (<div key={key}><SearchableSelect options={opts} value={dimensions[key]} onChange={(opt) => { if (key === 'brandId') setDimensions((d) => ({ ...d, brandId: String(opt.id), modelId: '' })); else updateDimension(key, String(opt.id)); }} placeholder={optionsLoading ? 'Loading…' : opts[0]?.name || 'Select'} disabled={optionsLoading || (key === 'modelId' && !modelOptions.length)} /></div>))}
              <div><SearchableSelect options={countryOptions} value={dimensions.countryId} onChange={(opt) => { setStates([]); setCities([]); setDimensions((d) => ({ ...d, countryId: String(opt.id), stateId: '', cityId: '' })); }} disabled={optionsLoading} placeholder="All countries" /></div>
              <div><SearchableSelect options={[{ id: '', name: 'All states' }, ...states]} value={dimensions.stateId} onChange={(opt) => { setCities([]); setDimensions((d) => ({ ...d, stateId: String(opt.id), cityId: '' })); }} disabled={!dimensions.countryId || !states.length} placeholder={dimensions.countryId ? (states.length ? 'All states' : 'None') : 'Select country'} /></div>
              <div><SearchableSelect options={[{ id: '', name: 'All cities' }, ...cities]} value={dimensions.cityId} onChange={(opt) => updateDimension('cityId', String(opt.id))} disabled={!dimensions.stateId || !cities.length} placeholder={dimensions.stateId ? (cities.length ? 'All cities' : 'None') : 'Select state'} /></div>
            </div>
            {optionsError && <p className="mt-3 text-[11px] font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">{optionsError}</p>}
          </div>
        )}
      </form>

      {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}
      {loading ? <BrandLoader variant="section" size="md" bg="light" text="Loading analytics workspace…" className="rounded-3xl border border-slate-200 bg-white p-16 shadow-sm" /> : null}

      {!loading && data && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard icon={<Layers className="h-4 w-4" />} label="Live listings" value={fmt(data.summary.liveListings)} note={fmtCurrency(data.summary.liveInventoryValue) + ' asking value'} accent="amber" />
            <KpiCard icon={<Eye className="h-4 w-4" />} label="Tracked views" value={fmt(data.summary.trackedViews.current)} note="Durable event impressions" accent="blue" trend={data.summary.trackedViews.trend} change={data.summary.trackedViews.percentageChange} />
            <KpiCard icon={<Users className="h-4 w-4" />} label="Total leads" value={fmt(data.summary.leads.current)} note={fmt(data.summary.activeLeads) + ' active · ' + fmt(data.summary.wonLeads) + ' won'} accent="violet" trend={data.summary.leads.trend} change={data.summary.leads.percentageChange} />
            <KpiCard icon={<Award className="h-4 w-4" />} label="Conversion rate" value={data.summary.conversionRate + '%'} note="Won leads ÷ total leads" accent="green" />
            <KpiCard icon={<Wallet className="h-4 w-4" />} label="Payment volume" value={fmtCurrency(data.summary.paymentAmount)} note={fmt(data.summary.paymentCount) + ' approved remittances'} accent="amber" />
            <KpiCard icon={<Sparkles className="h-4 w-4" />} label="Prime revenue" value={fmtCurrency(data.summary.primeSubscriptionAmount)} note={fmt(data.summary.primeSubscriptionCount) + ' subscriptions'} accent="violet" />
          </section>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Tracked searches" value={fmt(data.summary.trackedSearches)} note="Platform search events recorded" accent="blue" />
            <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Zero-result searches" value={fmt(data.summary.trackedZeroResultSearches)} note="Searches with no matching listings" accent="rose" />
            <KpiCard icon={<ShoppingBag className="h-4 w-4" />} label="Sold listings" value={fmt(data.summary.soldCount)} note={fmtCurrency(data.summary.soldValue) + ' total sale value'} accent="green" />
            <KpiCard icon={<PackageCheck className="h-4 w-4" />} label="Deposit collections" value={fmtCurrency(data.summary.depositAmount)} note={fmt(data.summary.depositCount) + ' deposits recorded'} accent="amber" />
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeading icon={<BarChart3 className="h-4 w-4" />} eyebrow="Inventory health" title="Listing status mix" detail="Actual count of listings grouped by their current review and publication state." />
              {data.listingStatusBreakdown.length ? (<div className="space-y-4 max-h-[280px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{data.listingStatusBreakdown.map((item) => { const pct = totalListingCount ? Math.round((item.count / totalListingCount) * 100) : 0; return (<div key={item.status}><div className="mb-1.5 flex items-center justify-between gap-3"><StatusBadge value={item.status} /><span className="text-xs font-bold text-slate-800">{fmt(item.count)} <span className="font-normal text-slate-400">({pct}%)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#f7b500] transition-all" style={{ width: pct + '%' }} /></div></div>); })}</div>) : <p className="py-8 text-center text-xs font-semibold text-slate-400">No listing status data.</p>}
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeading icon={<Users className="h-4 w-4" />} eyebrow="Lead intelligence" title="Lead status breakdown" detail={fmt(totalLeadCount) + ' total leads in selected scope.'} />
              {data.leadStatusBreakdown.length ? (<div className="space-y-4 max-h-[280px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{data.leadStatusBreakdown.map((item) => { const pct = totalLeadCount ? Math.round((item.count / totalLeadCount) * 100) : 0; return (<div key={item.status}><div className="mb-1.5 flex items-center justify-between gap-3"><StatusBadge value={item.status} type="lead" /><span className="text-xs font-bold text-slate-800">{fmt(item.count)} <span className="font-normal text-slate-400">({pct}%)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full transition-all ' + (LEAD_BAR[item.status] || 'bg-slate-400')} style={{ width: pct + '%' }} /></div></div>); })}</div>) : <p className="py-8 text-center text-xs font-semibold text-slate-400">No lead data.</p>}
            </section>
          </div>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
            <SectionHeading icon={<Activity className="h-4 w-4" />} eyebrow="Market intelligence" title="Model × manufacturing year" detail="Demand / stock score calculated using cumulative views and period leads per inventory unit." action={<div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input type="text" value={modelYearSearch} onChange={(e) => { setModelYearSearch(e.target.value); setModelYearPage(1); }} placeholder="Search machines…" className="w-44 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all sm:w-52" />{modelYearSearch && <button type="button" onClick={() => { setModelYearSearch(''); setModelYearPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-3 w-3" /></button>}</div><button type="button" onClick={() => setIsModelYearCollapsed(!isModelYearCollapsed)} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors">{isModelYearCollapsed ? 'Show Table' : 'Hide Table'}</button></div>} />
            {!isModelYearCollapsed && (<><div className="overflow-x-auto rounded-t-2xl border border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr>{['Machine', 'Year', 'Supply', 'Views', 'Leads', 'Won', 'Conversion', 'Demand / Stock'].map((h) => <th key={h} className="px-4 py-3 font-bold text-slate-600">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 bg-white text-slate-700">{paginatedModelYear.length ? paginatedModelYear.map((row) => (<tr key={row.brand + '-' + row.model + '-' + row.manufacturingYear} className="hover:bg-amber-50/30 transition-colors"><td className="px-4 py-3"><span className="block truncate font-semibold text-slate-900">{row.brand} · {row.model}</span><span className="text-[11px] text-slate-500">{row.brand} · Year {row.manufacturingYear}</span></td><td className="px-4 py-3">{row.manufacturingYear}</td><td className="px-4 py-3">{fmt(row.inventory)}</td><td className="px-4 py-3 font-medium text-blue-700">{fmt(row.views)}</td><td className="px-4 py-3 font-medium text-violet-700">{fmt(row.leads)}</td><td className="px-4 py-3 font-medium text-emerald-700">{fmt(row.wonLeads)}</td><td className="px-4 py-3">{row.conversionRate}%</td><td className="px-4 py-3"><span className={'font-black text-lg ' + ((row.demandPerStock ?? 0) >= 5 ? 'text-[#9a6b00]' : (row.demandPerStock ?? 0) >= 2 ? 'text-amber-600' : 'text-slate-500')}>{row.demandPerStock ?? '—'}</span></td></tr>)) : <EmptyRow cols={8} />}</tbody></table></div>{totalModelYearItems > 0 && <PaginationFooter startItem={totalModelYearItems === 0 ? 0 : (currentModelYearPage - 1) * modelYearPageSize + 1} endItem={Math.min(currentModelYearPage * modelYearPageSize, totalModelYearItems)} total={totalModelYearItems} page={currentModelYearPage} totalPages={totalModelYearPages} pageSize={modelYearPageSize} pageSizeOpen={openModelYearPageSizeDropdown} paginationItems={modelYearPaginationItems} unit="entries" onPageChange={(p) => setModelYearPage(p)} onPageSizeChange={(s) => { setModelYearPageSize(s); setModelYearPage(1); }} onPageSizeOpenChange={setOpenModelYearPageSizeDropdown} />}</>)}
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
            <SectionHeading icon={<ShoppingBag className="h-4 w-4" />} eyebrow="Listing intelligence" title="Listing performance" detail={<>Active machine listings ranked by engagement. <Link href={listingPath} className="font-bold text-[#9a6b00] hover:underline underline-offset-2">Open listings →</Link></>} action={<div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input type="text" value={listingSearch} onChange={(e) => { setListingSearch(e.target.value); setListingPage(1); }} placeholder="Search listings…" className="w-44 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all sm:w-52" />{listingSearch && <button type="button" onClick={() => { setListingSearch(''); setListingPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-3 w-3" /></button>}</div><button type="button" onClick={() => setIsListingCollapsed(!isListingCollapsed)} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors">{isListingCollapsed ? 'Show Table' : 'Hide Table'}</button></div>} />
            {!isListingCollapsed && (<><div className="overflow-x-auto rounded-t-2xl border border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[960px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr>{['Listing', 'Partner', 'Type', 'Status', 'Year', 'Views', 'Leads', 'Price', 'Analytics'].map((h) => <th key={h} className="px-4 py-3 font-bold text-slate-600">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 bg-white text-slate-700">{paginatedTopListings.length ? paginatedTopListings.map((listing) => { const locationCity = (listing.location || '').split(', ')[0] || undefined; const analyticsDetailPath = generateAdminListingDetailPath(analyticsBasePath, { id: listing.id, title: listing.title, manufacturingYear: listing.manufacturingYear, locationCity }); const listingDetailPath = generateAdminListingDetailPath(listingPath, { id: listing.id, title: listing.title, manufacturingYear: listing.manufacturingYear, locationCity }); return (<tr key={listing.id} className="group hover:bg-amber-50/40 cursor-pointer transition-colors" onClick={() => router.push(analyticsDetailPath)}><td className="px-4 py-3"><span className="block max-w-xs truncate font-bold text-slate-900 group-hover:text-[#9a6b00] transition-colors">{listing.title}</span><div className="mt-0.5 flex flex-wrap items-center gap-2"><span className="text-[11px] text-slate-500">{listing.brand?.name || '—'} · {listing.model?.name || '—'} · {listing.location || 'Location pending'}</span><Link href={listingDetailPath} onClick={(e) => e.stopPropagation()} className="text-[10px] font-bold text-[#9a6b00] hover:underline underline-offset-2">Open →</Link></div></td><td className="px-4 py-3 font-medium text-slate-800 align-middle">{listing.partner}</td><td className="px-4 py-3 align-middle"><span className={'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ' + (listing.isPrime || listing.partnerType === 'Prime Customer' ? 'bg-amber-100 text-amber-950 border-amber-300' : listing.partnerType === 'Broker' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-sky-50 text-sky-800 border-sky-200')}>{listing.partnerType || 'Authorized Place'}</span></td><td className="px-4 py-3 align-middle"><StatusBadge value={listing.status} /></td><td className="px-4 py-3 text-slate-600 align-middle">{listing.manufacturingYear}</td><td className="px-4 py-3 font-medium text-blue-700 align-middle">{fmt(listing.views)}</td><td className="px-4 py-3 font-medium text-violet-700 align-middle">{fmt(listing.leads)}</td><td className="px-4 py-3 font-black text-slate-900 align-middle">{fmtCurrency(listing.price)}</td><td className="px-4 py-3 align-middle"><Link href={analyticsDetailPath} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-[#9a6b00] transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400"><BarChart3 className="h-3 w-3" /> Details</Link></td></tr>); }) : <EmptyRow cols={9} />}</tbody></table></div>{totalListingItems > 0 && <PaginationFooter startItem={totalListingItems === 0 ? 0 : (currentListingPage - 1) * listingPageSize + 1} endItem={Math.min(currentListingPage * listingPageSize, totalListingItems)} total={totalListingItems} page={currentListingPage} totalPages={totalListingPages} pageSize={listingPageSize} pageSizeOpen={openListingPageSizeDropdown} paginationItems={listingPaginationItems} unit="listings" onPageChange={(p) => setListingPage(p)} onPageSizeChange={(s) => { setListingPageSize(s); setListingPage(1); }} onPageSizeOpenChange={setOpenListingPageSizeDropdown} />}</>)}
          </section>
        </>
      )}
    </main>
  );
}
