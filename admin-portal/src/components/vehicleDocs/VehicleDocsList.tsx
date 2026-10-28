'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Download, FileArchive, RefreshCw, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import { Badge, Button, buttonLinkClass, EmptyState, ErrorBanner, inputClass, LoadingState, tableHeadClass } from '@/components/financeWorkspace/ui';

export type VehicleRow = {
  vehicleNumber: string;
  title: string;
  owner: string | null;
  buyer: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  dealStatus: string | null;
  rtoStatus: string | null;
  listingStatus: string | null;
  documents: number;
  updatedAt: string;
};

export const statusText = (value: string | null | undefined) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : '');
export const statusTone = (value: string | null | undefined): 'green' | 'amber' | 'red' | 'blue' | 'slate' => {
  if (!value) return 'slate';
  if (/DONE|COMPLETED|SOLD|PUBLISHED|FULL/.test(value)) return 'green';
  if (/CANCEL|FAIL|REJECT/.test(value)) return 'red';
  if (/PAUSED|DRAFT|PENDING|CHANGES|OPEN/.test(value)) return 'amber';
  return 'blue';
};
export const vehicleDocsPath = (prefix: string, number?: string) => `${prefix}/accounts/vehicle-docs${number ? `/${encodeURIComponent(number)}` : ''}`;
export const zipFileName = (number: string, section?: string) => `${number.replace(/[^A-Za-z0-9]/g, '')} - ${section ? `${section} ` : ''}Documents.zip`;

/** Accounts → Vehicle Docs: every vehicle number with its documents, one ZIP per vehicle. */
export default function VehicleDocsList() {
  const pathname = usePathname();
  const router = useRouter();
  const prefix = pathname.startsWith('/employee') ? '/employee' : '/admin';
  const [rows, setRows] = useState<VehicleRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const [zipping, setZipping] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/vehicle-docs')
      .then((response) => { if (!cancelled) { setRows(response.data.vehicles as VehicleRow[]); setError(''); } })
      .catch((caught) => { if (!cancelled) setError(caught?.response?.data?.error || 'Could not load vehicles.'); });
    return () => { cancelled = true; };
  }, [version]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const compact = text.replace(/[^a-z0-9]/g, '');
    // Registration, chassis and engine numbers also match without spaces or dashes.
    return (rows ?? []).filter((row) => !text
      || [row.vehicleNumber, row.title, row.owner, row.buyer, row.chassisNumber, row.engineNumber].some((value) => String(value ?? '').toLowerCase().includes(text))
      || (compact.length > 2 && [row.vehicleNumber, row.chassisNumber, row.engineNumber].some((value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(compact))));
  }, [query, rows]);

  const downloadZip = async (number: string) => {
    setZipping(number);
    try {
      await downloadAuthedFile(`/vehicle-docs/${encodeURIComponent(number)}/zip`, zipFileName(number));
      toast.success(`ZIP for ${number} downloaded.`);
    } catch (caught) {
      toast.error(await readBlobErrorMessage(caught, 'Could not build the ZIP.'));
    } finally {
      setZipping(null);
    }
  };

  return (
    <div className="space-y-3 tabular-nums">
      <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-6 text-slate-900">Vehicle Docs</h1>
          <p className="text-[12px] text-slate-500">Every vehicle number with its deeds, KYC copies, Bill of Supply, receipts, refunds and photos. Download one file or everything as a ZIP with a vehicle details PDF.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vehicle, chassis or engine no., owner, buyer…" className={`${inputClass} pl-8`} aria-label="Search vehicles" />
          </div>
          <Button icon={<RefreshCw />} onClick={() => { setRows(null); setVersion((value) => value + 1); }}>Refresh</Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {error ? <ErrorBanner message={error} /> : rows === null ? <LoadingState /> : !filtered.length ? (
          <EmptyState title={rows.length ? 'No vehicle matches the search' : 'No vehicles yet'} description="Vehicles appear here once a Sold Vehicle record, an RTO record or a verified listing has a registration number." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-[13px]">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-3 py-2 font-medium">Vehicle number</th>
                    <th className="px-3 py-2 font-medium">Vehicle</th>
                    <th className="px-3 py-2 font-medium">Chassis no.</th>
                    <th className="px-3 py-2 font-medium">Engine no.</th>
                    <th className="px-3 py-2 font-medium">Owner / buyer</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Docs</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => (
                    <tr key={row.vehicleNumber} onClick={() => router.push(vehicleDocsPath(prefix, row.vehicleNumber))} className="cursor-pointer hover:bg-amber-50/40">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] font-semibold text-slate-900">{row.vehicleNumber}</td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-slate-800" title={row.title}>{row.title}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-slate-700">{row.chassisNumber || <span className="text-slate-400">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-slate-700">{row.engineNumber || <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2">
                        <p className="max-w-[200px] truncate text-slate-800">{row.owner || '—'}</p>
                        {row.buyer ? <p className="max-w-[200px] truncate text-[11px] text-slate-500">Buyer: {row.buyer}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.listingStatus ? <Badge tone={statusTone(row.listingStatus)}>Listing: {statusText(row.listingStatus)}</Badge> : null}
                          {row.dealStatus ? <Badge tone={statusTone(row.dealStatus)}>Sale: {statusText(row.dealStatus)}</Badge> : null}
                          {row.rtoStatus ? <Badge tone={statusTone(row.rtoStatus)}>RTO: {statusText(row.rtoStatus)}</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">{row.documents}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(row.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Link href={vehicleDocsPath(prefix, row.vehicleNumber)} className={buttonLinkClass('secondary')}><FileArchive className="h-3.5 w-3.5" />Open</Link>
                          <Button variant="primary" icon={<Download />} busy={zipping === row.vehicleNumber} disabled={Boolean(zipping)} onClick={() => void downloadZip(row.vehicleNumber)}>ZIP</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-3 py-2 text-[12px] text-slate-500">{filtered.length} of {rows.length} vehicles</p>
          </>
        )}
      </section>
    </div>
  );
}
