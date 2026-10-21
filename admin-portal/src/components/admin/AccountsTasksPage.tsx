/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, ExternalLink, ListTodo, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'TRANSFERRED' | 'ISSUE_REPORTED' | string;
type TaskRecord = {
  id: string;
  taskKey: string;
  label: string;
  isOptional?: boolean;
  status: TaskStatus;
  remark?: string | null;
  updatedAt?: string | null;
  rtoRecord: {
    id: string;
    vehicleNumber?: string | null;
    customerName?: string | null;
    rtoOffice?: string | null;
    rtoStatus?: string | null;
    sellAccount?: { recordNumber?: string | null; listingTitle?: string | null; brandName?: string | null; vehicleModel?: string | null; purchaserName?: string | null } | null;
  };
};

const date = (value: unknown) => {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
};
const statusLabel = (value: unknown) => String(value || 'PENDING').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const statusClass = (value: TaskStatus) => {
  if (value === 'COMPLETED' || value === 'TRANSFERRED') return 'bg-emerald-50 text-emerald-700';
  if (value === 'ISSUE_REPORTED') return 'bg-rose-50 text-rose-700';
  if (value === 'IN_PROGRESS') return 'bg-blue-50 text-blue-700';
  return 'bg-amber-50 text-amber-700';
};

export default function AccountsTasksPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const userPermissions = useMemo(() => user?.permissions || [], [user?.permissions]);
  const canViewTasks = Boolean(isSuperAdmin || userPermissions.includes('ALL_ACCESS') || userPermissions.includes('tasks.read'));
  const canOpenRto = Boolean(
    isSuperAdmin ||
    userPermissions.includes('ALL_ACCESS') ||
    userPermissions.includes('accounts.rto.read') ||
    userPermissions.includes('accounts.rto.crud')
  );

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const rtoPath = pathname.startsWith('/employee') ? '/employee/accounts/rto-work-status' : pathname.startsWith('/admin') ? '/admin/accounts/rto-work-status' : '/superadmin/accounts/rto-work-status';

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Always sync fresh user profile and permissions from server so role updates take effect immediately
      api.get('/auth/profile')
        .then((profileRes) => {
          if (profileRes.data?.user) {
            updateUser(profileRes.data.user);
          }
        })
        .catch(() => {});

      const response = await api.get('/recruitment/admin/rto-transfer-tasks');
      setTasks(Array.isArray(response.data?.tasks) ? response.data.tasks : []);
    } catch {
      setError('Unable to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [updateUser]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const statuses = useMemo(() => ['ALL', ...Array.from(new Set(tasks.map((task) => task.status)))], [tasks]);
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
      const haystack = [task.label, task.taskKey, task.remark, task.rtoRecord.vehicleNumber, task.rtoRecord.customerName, task.rtoRecord.rtoOffice, task.rtoRecord.sellAccount?.recordNumber, task.rtoRecord.sellAccount?.listingTitle, task.rtoRecord.sellAccount?.purchaserName].join(' ').toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [search, statusFilter, tasks]);
  const completedCount = tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'TRANSFERRED').length;
  const inProgressCount = tasks.filter((task) => task.status === 'IN_PROGRESS').length;

  if (!canViewTasks) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="h-12 w-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You do not have permission to view Tasks.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div><div className="flex items-center gap-2 text-[#3B61D9]"><ListTodo className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Daily Operations</span></div><h1 className="mt-1 text-2xl font-semibold text-gray-900">Tasks</h1><p className="mt-1 text-sm text-gray-500">All RTO and ownership-transfer tasks across sold vehicles.</p></div>
          <button type="button" onClick={() => void loadTasks()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total tasks</p><p className="mt-1 text-xl font-semibold text-gray-900">{tasks.length}</p></div><div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Completed</p><p className="mt-1 text-xl font-semibold text-emerald-700">{completedCount}</p></div><div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">In progress</p><p className="mt-1 text-xl font-semibold text-blue-700">{inProgressCount}</p></div></div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold text-gray-900">Task register</h2><p className="mt-0.5 text-xs text-gray-500">Track every ownership-transfer task from one screen.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, vehicle, customer..." className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-[#3B61D9] focus:bg-white" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-700 outline-none focus:border-[#3B61D9]">{statuses.map((status) => <option key={status} value={status}>{status === 'ALL' ? 'All statuses' : statusLabel(status)}</option>)}</select></div></div>
          {loading ? <div className="flex min-h-56 items-center justify-center"><BrandLoader size="sm" /></div> : error ? <div className="p-8 text-center text-sm text-rose-600">{error}</div> : filteredTasks.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No tasks found.</div> : (
            <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3 font-semibold">Task</th><th className="px-4 py-3 font-semibold">Vehicle / Record</th><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">RTO office</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Updated</th>{canOpenRto ? <th className="px-4 py-3 text-right font-semibold">Action</th> : null}</tr></thead><tbody className="divide-y divide-gray-100">{filteredTasks.map((task) => <tr key={task.id} className="hover:bg-gray-50/70"><td className="px-4 py-3"><div className="flex items-start gap-2"><ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#3B61D9]" /><div><p className="font-semibold text-gray-900">{task.label}</p><p className="text-xs text-gray-500">{task.taskKey}{task.isOptional ? ' · Optional' : ''}</p></div></div></td><td className="px-4 py-3"><p className="font-medium text-gray-800">{task.rtoRecord.vehicleNumber || '—'}</p><p className="text-xs text-gray-500">{task.rtoRecord.sellAccount?.recordNumber || 'RTO record'}{task.rtoRecord.sellAccount?.listingTitle ? ` · ${task.rtoRecord.sellAccount.listingTitle}` : ''}</p></td><td className="px-4 py-3"><p className="font-medium text-gray-800">{task.rtoRecord.customerName || task.rtoRecord.sellAccount?.purchaserName || '—'}</p><p className="text-xs text-gray-500">{task.remark || 'No remark'}</p></td><td className="px-4 py-3 text-gray-600">{task.rtoRecord.rtoOffice || '—'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(task.status)}`}>{statusLabel(task.status)}</span></td><td className="px-4 py-3 text-gray-600">{date(task.updatedAt)}</td>{canOpenRto ? <td className="px-4 py-3 text-right"><button type="button" onClick={() => router.push(`${rtoPath}/${task.rtoRecord.id}/edit`)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><ExternalLink className="h-3.5 w-3.5" />Open</button></td> : null}</tr>)}</tbody></table></div>
          )}
        </div>
      </div>
    </div>
  );
}
