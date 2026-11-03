'use client';

import { useMemo, useState } from 'react';
import { Award, ArrowUpRight, MapPin, Phone, RefreshCw, Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCrmBase, CrmErrorBanner, CrmLoadingState, getJson, useCrmResource, type ContactLite } from '@/components/crm/crmShared';
import { generateAdminContactDetailPath } from '@/lib/routePaths';

type WonCustomer = ContactLite & {
  status: string;
  createdAt: string;
  isPrime: boolean;
  leadCount: number;
  openLeadCount: number;
  lastLeadAt: string | null;
  nextFollowUpAt: string | null;
  pipelineStage: { code: string; name: string; color: string; isTerminal: boolean } | null;
  crmProfile: { companyName: string | null; lifecycle: string; contactTypes: string[]; tags: string[]; doNotContact: boolean; owner: { id: string; name: string | null } | null } | null;
};

type WonCustomersResponse = { total: number; items: WonCustomer[] };
const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const customerName = (customer: WonCustomer) => customer.name || customer.mobile || customer.email || 'Unnamed customer';
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';

export default function WonCustomersPage() {
  const router = useRouter();
  const { base } = useCrmBase();
  const portalPrefix = base.replace(/\/crm$/, '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useMemo(() => ({ pipelineStage: 'WON', page, pageSize: 100, ...(search.trim() ? { q: search.trim() } : {}) }), [page, search]);
  const data = useCrmResource(() => getJson<WonCustomersResponse>('/crm/contacts', query), `won-customers-${JSON.stringify(query)}`);
  const customers = data.data?.items || [];
  const totalPages = Math.max(1, Math.ceil((data.data?.total || 0) / query.pageSize));

  if (data.loading && !data.data) return <CrmLoadingState label="Loading won customers..." />;
  if (data.error || !data.data) return <CrmErrorBanner message={data.error || 'Could not load won customers.'} schemaMissing={data.schemaMissing} />;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-3 p-3 sm:p-4 lg:p-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Award className="h-5 w-5" /></div><div><h1 className="text-lg font-black tracking-tight text-slate-950">Won Customers</h1><p className="text-xs text-slate-500">Customers with at least one CRM deal closed as Won.</p></div></div><button type="button" onClick={() => data.reload()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Unique won customers</p><p className="mt-1 text-2xl font-black text-emerald-900">{data.data.total}</p></div><div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active accounts</p><p className="mt-1 text-2xl font-black text-slate-900">{customers.filter((customer) => customer.status === 'ACTIVE').length}</p></div><div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Prime customers</p><p className="mt-1 text-2xl font-black text-amber-700">{customers.filter((customer) => customer.isPrime).length}</p></div></div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-2 border-b border-slate-100 p-2.5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Users className="h-4 w-4 text-emerald-600" /> Customer directory</h2><p className="mt-0.5 text-[11px] text-slate-500">One row per customer, even when multiple enquiries were won.</p></div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" placeholder="Search customer, phone, city..." /></div></div>{customers.length === 0 ? <div className="p-12 text-center"><Award className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No won customers found</p><p className="mt-1 text-xs text-slate-500">A customer appears here after a CRM deal is moved to Won.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2.5 font-black">Customer</th><th className="px-3 py-2.5 font-black">Contact</th><th className="px-3 py-2.5 font-black">Location</th><th className="px-3 py-2.5 font-black">Won journey</th><th className="px-3 py-2.5 font-black">Owner</th><th className="px-3 py-2.5 font-black">Last enquiry</th><th className="px-3 py-2.5 text-right font-black">View</th></tr></thead><tbody className="divide-y divide-slate-100">{customers.map((customer) => { const name = customerName(customer); const detailHref = generateAdminContactDetailPath(`${portalPrefix}/customers`, customer); return <tr key={customer.id} onClick={() => router.push(detailHref)} className="group cursor-pointer transition hover:bg-emerald-50/40"><td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-[10px] font-black text-white">{initials(name)}</div><div className="min-w-0"><p className="max-w-[230px] truncate font-bold text-slate-900 group-hover:text-emerald-800">{name}</p><p className="text-[10px] text-slate-400">{customer.crmProfile?.companyName || (customer.isPrime ? 'Prime customer' : 'Customer')}</p></div></div></td><td className="px-3 py-2.5"><p className="flex items-center gap-1 font-semibold text-slate-700"><Phone className="h-3 w-3 text-slate-400" />{customer.mobile || '—'}</p><p className="max-w-[190px] truncate text-[10px] text-slate-400">{customer.email || 'No email'}</p></td><td className="px-3 py-2.5 text-slate-600"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{[customer.city, customer.state].filter(Boolean).join(', ') || '—'}</span></td><td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800"><Award className="h-3 w-3" />{customer.leadCount} CRM lead{customer.leadCount === 1 ? '' : 's'} · Won</span></td><td className="px-3 py-2.5 text-slate-600">{customer.crmProfile?.owner?.name || 'Unassigned'}</td><td className="px-3 py-2.5"><p className="font-semibold text-slate-700">{formatDate(customer.lastLeadAt)}</p><p className="text-[10px] text-slate-400">{customer.pipelineStage?.name || 'Won'}</p></td><td className="px-3 py-2.5 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); router.push(detailHref); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800">360 view <ArrowUpRight className="h-3 w-3" /></button></td></tr>; })}</tbody></table></div>}<div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 text-[11px] text-slate-500"><span>Page {page} of {totalPages} · {data.data.total} customers</span><div className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold disabled:opacity-40">Next</button></div></div></section>
    </div>
  );
}
