'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, ExternalLink, Filter, MapPin, MessageCircle, Pencil, Phone, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, Users, Crown, X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DeleteImpactDialog from '@/components/portal/DeleteImpactDialog';
import BrandLoader from '@/components/ui/BrandLoader';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { generateAdminVisitorDetailPath } from '@/lib/routePaths';

export type VisitorRecord = {
  id: string;
  name: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role: string;
  status: string;
  authProvider: string;
  city: string | null;
  state: string | null;
  isPrimeCustomer?: boolean;
  customerCategory?: string | null;
  primeSubscriptionExpiresAt?: string | null;
  primeSubscriptionStatus?: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string | null; role: string } | null;
};

type VisitorResponse = { visitors: VisitorRecord[] };
type VisitorSegment = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'PRIME';
const inputClass = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100';
const visitorName = (visitor: VisitorRecord) => visitor.fullName || visitor.name || visitor.email || 'Unnamed visitor';
const formatDate = (value?: string | null) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); };
const relativeDate = (value?: string | null) => { if (!value) return ''; const diff = Date.now() - new Date(value).getTime(); if (!Number.isFinite(diff)) return ''; if (diff < 60_000) return 'Just now'; if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`; if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`; if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`; return formatDate(value); };
const label = (value?: string | null) => value ? value.toLowerCase().split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ') : 'Not set';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'V';
const avatarColors = ['from-amber-400 to-orange-500', 'from-sky-500 to-indigo-600', 'from-emerald-500 to-teal-600', 'from-fuchsia-500 to-purple-600', 'from-rose-500 to-pink-600'];
const avatarClass = (id: string) => avatarColors[Math.abs([...id].reduce((total, char) => total + char.charCodeAt(0), 0)) % avatarColors.length];
const cleanPhone = (phone?: string | null) => (phone || '').replace(/\D/g, '');
const sourceMeta = (visitor: VisitorRecord) => {
  if (visitor.createdBy?.role === 'SUPER_ADMIN' || visitor.createdBy?.role === 'ADMIN') return { label: 'Admin added', className: 'border-violet-200 bg-violet-50 text-violet-700' };
  if (visitor.authProvider === 'GOOGLE') return { label: 'Google', className: 'border-sky-200 bg-sky-50 text-sky-700' };
  if (visitor.authProvider === 'PHONE') return { label: 'Mobile OTP', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  return { label: 'Self registered', className: 'border-slate-200 bg-slate-50 text-slate-600' };
};

export default function VisitorDirectoryPage({ detailBaseHref = '/admin/visitors' }: { detailBaseHref?: string }) {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const permissions = currentUser?.permissions || [];
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canView = isSuperAdmin || hasAnyPermission(permissions, ['visitors.read']);
  const canUpdate = isSuperAdmin || hasAnyPermission(permissions, ['visitors.update']);
  const canChangeStatus = isSuperAdmin || hasAnyPermission(permissions, ['visitors.change_status']);
  const canDelete = isSuperAdmin || hasAnyPermission(permissions, ['visitors.delete']);
  const customersHref = detailBaseHref.startsWith('/employee') ? '/employee/customers' : '/admin/customers';
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<VisitorSegment>('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [editVisitor, setEditVisitor] = useState<VisitorRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', mobile: '', city: '', state: '' });
  const [deleteVisitor, setDeleteVisitor] = useState<VisitorRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pageSize = 20;

  const loadVisitors = useCallback(async (manual = false) => {
    if (!canView) { setLoading(false); setError('You do not have permission to view visitors.'); return; }
    try {
      manual ? setRefreshing(true) : setLoading(true);
      setError('');
      const response = await api.get<VisitorResponse>('/superadmin/visitors?compact=true');
      setVisitors(response.data.visitors || []);
      if (manual) toast.success(`Refreshed ${response.data.visitors?.length || 0} visitors`);
    } catch (loadError) {
      setError(axios.isAxiosError(loadError) ? loadError.response?.data?.error || 'Unable to load visitors.' : 'Unable to load visitors.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [canView]);

  useEffect(() => { void loadVisitors(); }, [loadVisitors]);
  const filteredVisitors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visitors.filter((visitor) => {
      if (segment === 'ACTIVE' && visitor.status !== 'ACTIVE') return false;
      if (segment === 'INACTIVE' && visitor.status !== 'INACTIVE') return false;
      if (segment === 'PRIME' && !visitor.isPrimeCustomer) return false;
      if (sourceFilter !== 'ALL' && ['GOOGLE', 'PHONE'].includes(sourceFilter) && visitor.authProvider !== sourceFilter) return false;
      if (sourceFilter === 'ADMIN' && !['SUPER_ADMIN', 'ADMIN'].includes(visitor.createdBy?.role || '')) return false;
      if (sourceFilter === 'SELF' && ['SUPER_ADMIN', 'ADMIN'].includes(visitor.createdBy?.role || '')) return false;
      if (query && ![visitorName(visitor), visitor.email, visitor.mobile, visitor.city, visitor.state, visitor.authProvider, visitor.role].filter(Boolean).join(' ').toLowerCase().includes(query)) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [search, segment, sourceFilter, visitors]);
  useEffect(() => { setPage(1); }, [search, segment, sourceFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredVisitors.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredVisitors.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const metrics = useMemo(() => ({ total: visitors.length, active: visitors.filter((visitor) => visitor.status === 'ACTIVE').length, prime: visitors.filter((visitor) => visitor.isPrimeCustomer).length, cities: new Set(visitors.map((visitor) => visitor.city).filter(Boolean)).size }), [visitors]);
  const openDetails = (visitor: VisitorRecord) => router.push(generateAdminVisitorDetailPath(detailBaseHref, visitor));
  const toggleStatus = async (visitor: VisitorRecord) => {
    if (!canChangeStatus) { toast.error('You do not have permission to change visitor status.'); return; }
    try {
      setBusyId(visitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(`/superadmin/users/${visitor.id}/status`, { status: visitor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      setVisitors((current) => current.map((item) => item.id === visitor.id ? response.data.user : item));
      toast.success(`${visitorName(visitor)} is now ${visitor.status === 'ACTIVE' ? 'inactive' : 'active'}`);
    } catch (statusError) { toast.error(axios.isAxiosError(statusError) ? statusError.response?.data?.error || 'Unable to update status.' : 'Unable to update status.'); } finally { setBusyId(null); }
  };
  const openEdit = (visitor: VisitorRecord) => { if (!canUpdate) { toast.error('You do not have permission to edit visitors.'); return; } setEditVisitor(visitor); setEditForm({ name: visitor.fullName || visitor.name || '', email: visitor.email || '', mobile: visitor.mobile || '', city: visitor.city || '', state: visitor.state || '' }); };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault(); if (!editVisitor) return;
    try {
      setBusyId(editVisitor.id);
      const response = await api.patch<{ user: VisitorRecord }>(`/superadmin/users/${editVisitor.id}`, { ...editForm, name: editForm.name.trim(), email: editForm.email.trim(), mobile: editForm.mobile.trim() || undefined });
      setVisitors((current) => current.map((item) => item.id === editVisitor.id ? response.data.user : item)); setEditVisitor(null); toast.success('Visitor details updated.');
    } catch (editError) { toast.error(axios.isAxiosError(editError) ? editError.response?.data?.error || 'Unable to update visitor.' : 'Unable to update visitor.'); } finally { setBusyId(null); }
  };
  const exportCsv = () => {
    const headers = ['Name', 'Mobile', 'Email', 'City', 'State', 'Status', 'Membership', 'Source', 'Joined'];
    const rows = filteredVisitors.map((visitor) => [visitorName(visitor), visitor.mobile || '', visitor.email || '', visitor.city || '', visitor.state || '', visitor.status, visitor.isPrimeCustomer ? 'Prime' : 'Standard', sourceMeta(visitor).label, visitor.createdAt].map((value) => `"${String(value).replace(/"/g, '""')}"`));
    const blob = new Blob([[headers.join(','), ...rows.map((row) => row.join(','))].join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `jcb-visitors-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); toast.success(`Exported ${filteredVisitors.length} visitors`);
  };

  if (loading) return <BrandLoader variant="section" size="sm" bg="light" text="Loading visitor directory..." />;
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 p-3 sm:p-4 lg:p-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Users className="h-5 w-5" /></div><div className="min-w-0"><h1 className="truncate text-base font-black tracking-tight text-slate-950 sm:text-lg">Visitor &amp; Customer Directory</h1><p className="truncate text-xs text-slate-500">Every registered visitor, buyer signal and customer account in one compact workspace.</p></div></div><div className="flex shrink-0 flex-wrap items-center gap-2"><a href={customersHref} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"><UserCheck className="h-3.5 w-3.5" /> Won customers</a><button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Export</button><button type="button" onClick={() => void loadVisitors(true)} disabled={refreshing} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button></div></header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: 'Registered visitors', value: metrics.total, icon: Users, tone: 'text-slate-900' }, { label: 'Active accounts', value: metrics.active, icon: UserCheck, tone: 'text-emerald-700' }, { label: 'Prime customers', value: metrics.prime, icon: Crown, tone: 'text-amber-700' }, { label: 'Cities covered', value: metrics.cities, icon: MapPin, tone: 'text-sky-700' }].map((metric) => { const Icon = metric.icon; return <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{metric.label}</span><Icon className={`h-4 w-4 ${metric.tone}`} /></div><p className={`mt-1 text-xl font-black ${metric.tone}`}>{metric.value}</p></div>; })}</div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div> : null}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-2 border-b border-slate-100 p-2.5 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-1 overflow-x-auto">{([['ALL', 'All visitors'], ['ACTIVE', 'Active'], ['PRIME', 'Prime'], ['INACTIVE', 'Inactive']] as const).map(([key, text]) => <button key={key} type="button" onClick={() => setSegment(key)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${segment === key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>{text}{key === 'ALL' ? ` · ${metrics.total}` : key === 'ACTIVE' ? ` · ${metrics.active}` : key === 'PRIME' ? ` · ${metrics.prime}` : ` · ${metrics.total - metrics.active}`}</button>)}</div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative min-w-0 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, city..." /></div><div className="relative sm:w-40"><Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><select className={`${inputClass} appearance-none pl-9`} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="ALL">All sources</option><option value="PHONE">Mobile OTP</option><option value="GOOGLE">Google</option><option value="SELF">Self registered</option><option value="ADMIN">Admin added</option></select></div></div></div>
      {pageRows.length === 0 ? <div className="p-12 text-center"><Users className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No visitors match these filters</p><p className="mt-1 text-xs text-slate-500">Try clearing the search or selecting All visitors.</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[940px] text-left text-xs"><thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2.5 font-black">Visitor</th><th className="px-3 py-2.5 font-black">Contact</th><th className="px-3 py-2.5 font-black">Location</th><th className="px-3 py-2.5 font-black">Source</th><th className="px-3 py-2.5 font-black">Account</th><th className="px-3 py-2.5 font-black">Joined</th><th className="px-3 py-2.5 text-right font-black">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map((visitor) => { const name = visitorName(visitor); const source = sourceMeta(visitor); const active = visitor.status === 'ACTIVE'; return <tr key={visitor.id} onClick={() => openDetails(visitor)} className="group cursor-pointer transition hover:bg-amber-50/40"><td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarClass(visitor.id)} text-[10px] font-black text-white shadow-sm`}>{initials(name)}</div><div className="min-w-0"><p className="max-w-[220px] truncate font-bold text-slate-900 group-hover:text-amber-800">{name}</p><p className="text-[10px] text-slate-400">{label(visitor.role)}{visitor.isPrimeCustomer ? ' · Prime' : ''}</p></div></div></td><td className="px-3 py-2.5"><div className="space-y-0.5">{visitor.mobile ? <a href={`tel:${visitor.mobile}`} onClick={(event) => event.stopPropagation()} className="flex items-center gap-1 font-semibold text-slate-700 hover:text-emerald-700"><Phone className="h-3 w-3" />{visitor.mobile}</a> : <span className="text-slate-400">No mobile</span>}{visitor.email ? <span className="block max-w-[190px] truncate text-[10px] text-slate-400">{visitor.email}</span> : null}</div></td><td className="px-3 py-2.5 text-slate-600">{visitor.city || visitor.state ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{[visitor.city, visitor.state].filter(Boolean).join(', ')}</span> : '—'}</td><td className="px-3 py-2.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${source.className}`}>{source.label}</span></td><td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className={active ? 'font-bold text-emerald-700' : 'font-semibold text-slate-500'}>{active ? 'Active' : label(visitor.status)}</span></div>{visitor.primeSubscriptionExpiresAt ? <span className="mt-0.5 block text-[10px] text-amber-700">Prime till {formatDate(visitor.primeSubscriptionExpiresAt)}</span> : null}</td><td className="px-3 py-2.5"><p className="font-semibold text-slate-700">{formatDate(visitor.createdAt)}</p><p className="text-[10px] text-slate-400">{relativeDate(visitor.createdAt)}</p></td><td className="px-3 py-2.5"><div className="flex justify-end gap-1"><button type="button" onClick={(event) => { event.stopPropagation(); openDetails(visitor); }} title="Open 360 view" className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-700"><ExternalLink className="h-3.5 w-3.5" /></button>{visitor.mobile ? <a href={`https://wa.me/${cleanPhone(visitor.mobile).length === 10 ? `91${cleanPhone(visitor.mobile)}` : cleanPhone(visitor.mobile)}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} title="WhatsApp" className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><MessageCircle className="h-3.5 w-3.5" /></a> : null}<button type="button" onClick={(event) => { event.stopPropagation(); openEdit(visitor); }} title="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700"><Pencil className="h-3.5 w-3.5" /></button>{canChangeStatus ? <button type="button" disabled={busyId === visitor.id} onClick={(event) => { event.stopPropagation(); void toggleStatus(visitor); }} title={active ? 'Deactivate' : 'Activate'} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" /></button> : null}{canDelete ? <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteVisitor(visitor); }} title="Delete" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button> : null}</div></td></tr>; })}</tbody></table></div><div className="divide-y divide-slate-100 md:hidden">{pageRows.map((visitor) => { const name = visitorName(visitor); const source = sourceMeta(visitor); return <div key={visitor.id} onClick={() => openDetails(visitor)} className="cursor-pointer p-3 transition hover:bg-amber-50/40"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarClass(visitor.id)} text-xs font-black text-white`}>{initials(name)}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{name}</p><p className="truncate text-xs text-slate-500">{visitor.mobile || visitor.email || 'No contact details'}</p></div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${source.className}`}>{source.label}</span></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500"><span>{[visitor.city, visitor.state].filter(Boolean).join(', ') || 'Location not set'}</span><span>{label(visitor.status)}</span><span>{relativeDate(visitor.createdAt)}</span>{visitor.isPrimeCustomer ? <span className="font-bold text-amber-700">Prime</span> : null}</div></div>; })}</div><div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 text-[11px] text-slate-500"><span>{filteredVisitors.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredVisitors.length)} of ${filteredVisitors.length}` : '0 visitors'}</span><div className="flex items-center gap-1"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold disabled:opacity-40">Previous</button><span className="px-2 font-bold text-slate-700">{currentPage} / {totalPages}</span><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold disabled:opacity-40">Next</button></div></div></>}</section>
      {editVisitor ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><form onSubmit={saveEdit} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">Edit visitor</h2><p className="text-xs text-slate-500">Update the customer account details.</p></div><button type="button" onClick={() => setEditVisitor(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{(['name', 'mobile', 'email', 'city', 'state'] as const).map((field) => <label key={field} className="text-xs font-bold capitalize text-slate-600">{field}<input type={field === 'email' ? 'email' : 'text'} className={`${inputClass} mt-1`} value={editForm[field]} onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })} /></label>)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditVisitor(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={busyId === editVisitor.id} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === editVisitor.id ? 'Saving...' : 'Save changes'}</button></div></form></div> : null}
      {deleteVisitor ? <DeleteImpactDialog open title="Delete visitor" impactPath={`/superadmin/users/${deleteVisitor.id}/delete-impact`} deletePath={`/superadmin/users/${deleteVisitor.id}`} reasonRequired={false} onClose={() => setDeleteVisitor(null)} onDeleted={(message) => { setVisitors((current) => current.filter((item) => item.id !== deleteVisitor.id)); setDeleteVisitor(null); toast.success(message || 'Visitor deleted.'); }} onAlternative={async (status, reason) => { const response = await api.patch<{ user: VisitorRecord }>(`/superadmin/users/${deleteVisitor.id}/status`, { status, reason }); setVisitors((current) => current.map((item) => item.id === deleteVisitor.id ? response.data.user : item)); setDeleteVisitor(null); toast.success(`${visitorName(deleteVisitor)} is now ${label(status)}`); }} /> : null}
    </div>
  );
}
