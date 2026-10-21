'use client';

import { FormEvent, Fragment, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { enumLabel } from '@/lib/financeWorkspaceClient';
import { Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Panel, tableHeadClass } from './ui';
import { useResource } from './useResource';

type Log = { id: string; createdAt: string; actorName: string; entityType: string; entityId: string; action: string; reason: string | null; beforeJson: unknown; afterJson: unknown; ipAddress: string | null };
type Response = { logs: Log[]; total: number; page: number; pageSize: number; entityTypes: string[]; actions: string[] };

const entityLabel = (value: string) => value.replace(/^Fin/, '').replace(/([a-z])([A-Z])/g, '$1 $2');

export default function AuditTrailModule() {
  const [filters, setFilters] = useState({ entityType: '', action: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const audit = useResource(
    async () => (await api.get('/finance-hub/audit-logs', { params: { ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)), page, pageSize: 50 } })).data as Response,
    `audit-${JSON.stringify(applied)}-${page}`,
  );
  const totalPages = audit.data ? Math.max(Math.ceil(audit.data.total / audit.data.pageSize), 1) : 1;
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters); };

  return (
    <Panel title="Audit trail" description="Every change in the finance workspace: who, when, what changed (before → after) and why. Read-only and never purged.">
      <form onSubmit={apply} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_1fr_150px_150px_auto] md:items-end">
        <Field label="Record type">
          <select value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })} className={inputClass}>
            <option value="">All</option>
            {(audit.data?.entityTypes ?? []).map((item) => <option key={item} value={item}>{entityLabel(item)}</option>)}
          </select>
        </Field>
        <Field label="Action">
          <select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} className={inputClass}>
            <option value="">All</option>
            {(audit.data?.actions ?? []).map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} /></Field>
        <Field label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} /></Field>
        <Button type="submit" variant="primary">Apply</Button>
      </form>
      {audit.loading ? <LoadingState /> : audit.error ? <ErrorBanner message={audit.error} schemaMissing={audit.schemaMissing} /> : !audit.data?.logs.length ? <EmptyState title="No activity found" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Record</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {audit.data.logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs">{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-800">{log.actorName}</td>
                      <td className="px-4 py-2.5">{enumLabel(log.action)}</td>
                      <td className="px-4 py-2.5 text-xs">{entityLabel(log.entityType)} <span className="font-mono text-slate-400">{log.entityId.slice(0, 8)}</span></td>
                      <td className="max-w-[260px] truncate px-4 py-2.5 text-xs" title={log.reason ?? ''}>{log.reason ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">{log.beforeJson || log.afterJson ? <Button variant="ghost" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>{expanded === log.id ? 'Hide' : 'Changes'}</Button> : null}</td>
                    </tr>
                    {expanded === log.id ? (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div><p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Before</p><pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-[11px] text-slate-700">{JSON.stringify(log.beforeJson, null, 2) ?? '—'}</pre></div>
                            <div><p className="mb-1 text-[11px] font-bold uppercase text-slate-500">After</p><pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-[11px] text-slate-700">{JSON.stringify(log.afterJson, null, 2) ?? '—'}</pre></div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{audit.data.total} events</span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>Prev</Button>
              Page {page} of {totalPages}
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />}>Next</Button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
