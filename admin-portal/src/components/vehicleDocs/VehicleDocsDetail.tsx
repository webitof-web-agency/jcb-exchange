'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Download, ExternalLink, Eye, FileArchive, FileText, Film, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { downloadAuthedFile, readBlobErrorMessage } from '@/lib/authedDownload';
import { Badge, Button, buttonLinkClass, EmptyState, ErrorBanner, LoadingState, Modal } from '@/components/financeWorkspace/ui';
import { statusText, statusTone, vehicleDocsPath, zipFileName } from './VehicleDocsList';

type Doc = { id: string; section: string; checklistKey: string | null; label: string; fileName: string; mimeType: string; size: number | null; date: string | null; generated: boolean; isVideo: boolean };
type ChecklistItem = { key: string; label: string; section: string; state: 'AVAILABLE' | 'NA' | 'NOT_REQUIRED'; note: string | null; docIds: string[] };
type Sale = {
  id: string; recordNumber: string; dealStatus: string; isDraft: boolean; isLocked: boolean; cancelledAt: string | null; sourceType: string | null;
  sellerName: string | null; sellerNumber: string | null; purchaserName: string | null; purchaserNumber: string | null; purchaserCity: string | null;
  sellDate: string | null; purchaseAmount: number; sellAmount: number; received: number; paidToSeller: number; invoiceNumber: string | null; creditNoteNumber: string | null;
};
type Vehicle = {
  vehicleNumber: string; title: string; category: string | null; brand: string | null; model: string | null; year: number | null; hours: number | null;
  chassisNumber: string | null; engineNumber: string | null; location: string | null; owner: string | null;
  listing: { id: string; title: string; status: string; partner: string | null; sellerPrice: number | null; finalPrice: number | null; soldAt: string | null } | null;
  sales: Sale[];
  rto: {
    id: string; status: string | null; office: string | null; agent: string | null; hirePurchase: string | null; financer: string | null;
    tax: Array<string | null>; fitness: Array<string | null>; insurance: Array<string | null>; puc: Array<string | null>; hsrp: Array<string | null>;
    tasks: Array<{ label: string; status: string; remark: string | null }>;
  } | null;
  sections: string[];
  checklist: ChecklistItem[];
  documents: Doc[];
};

const SECTION_HINTS: Record<string, string> = {
  'Seller & Purchase': 'Upload on the Sold Vehicle record (purchase side).',
  'Buyer & Sale': 'Upload on the Sold Vehicle record (sale side).',
  'Invoices & Payments': 'Generated when the Bill of Supply, receipts, credit note or refunds are issued.',
  'RTO Transfer': 'Upload on RTO Work → Ownership Transfer Tasks.',
  'Listing & Photos': 'From the listing.',
  Other: 'Finance document vault files tagged with this vehicle.',
};
const inr = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const pairText = (pair: Array<string | null>) => [statusText(pair[0]), pair[1]].filter(Boolean).join(' · ') || '—';

/** Loads an authenticated file as an object URL for previews; revoked when the component unmounts. */
function useBlobUrl(path: string | null) {
  const [state, setState] = useState<{ path: string | null; url: string | null; error: string }>({ path: null, url: null, error: '' });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    api.get(path, { responseType: 'blob' })
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data as Blob);
        if (!cancelled) setState({ path, url: objectUrl, error: '' });
      })
      .catch(async (caught) => { if (!cancelled) setState({ path, url: null, error: await readBlobErrorMessage(caught, 'Could not load the file.') }); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return state.path === path ? state : { path, url: null, error: '' };
}

function Thumb({ number, doc }: { number: string; doc: Doc }) {
  const isImage = doc.mimeType.startsWith('image/');
  const blob = useBlobUrl(isImage ? `/vehicle-docs/${encodeURIComponent(number)}/files/${encodeURIComponent(doc.id)}?inline=1` : null);
  if (isImage) {
    // Authenticated files are shown from object URLs, which next/image cannot load.
    // eslint-disable-next-line @next/next/no-img-element
    if (blob.url) return <img src={blob.url} alt={doc.label} className="h-full w-full object-cover" />;
    return <div className="flex h-full items-center justify-center text-slate-300">{blob.error ? <ImageIcon className="h-6 w-6" /> : <Loader2 className="h-5 w-5 animate-spin" />}</div>;
  }
  const Icon = doc.isVideo ? Film : FileText;
  return <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400"><Icon className="h-7 w-7" /><span className="text-[11px] font-medium uppercase">{doc.isVideo ? 'Video' : doc.mimeType === 'application/pdf' ? 'PDF' : 'File'}</span></div>;
}

function PreviewModal({ title, path, mimeType, onClose, onDownload }: { title: string; path: string; mimeType: string; onClose: () => void; onDownload: () => void }) {
  const blob = useBlobUrl(path);
  return (
    <Modal wide title={title} onClose={onClose}>
      <div className="flex h-[72vh] items-center justify-center bg-slate-100 p-2">
        {blob.error ? <p className="text-[13px] text-red-700">{blob.error}</p> : !blob.url ? <LoadingState label="Loading preview…" /> : mimeType.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blob.url} alt={title} className="max-h-full max-w-full rounded object-contain" />
        ) : mimeType.startsWith('video/') ? (
          <video src={blob.url} controls className="max-h-full max-w-full rounded" />
        ) : mimeType === 'application/pdf' ? (
          <iframe src={blob.url} title={title} className="h-full w-full rounded bg-white" />
        ) : <p className="text-[13px] text-slate-600">No preview for this file type. Download it instead.</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
        <Button icon={<Download />} onClick={onDownload}>Download</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function StateBadge({ item }: { item: ChecklistItem }) {
  if (item.state === 'AVAILABLE') return <Badge tone="green">{item.docIds.length > 1 ? `${item.docIds.length} files` : 'Available'}</Badge>;
  if (item.state === 'NOT_REQUIRED') return <Badge tone="slate">Not required</Badge>;
  return <span className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[11px] font-semibold text-slate-400">NA</span>;
}

/** One file inside a checklist row: small thumbnail, name, date, preview and download. */
function FileRow({ number, doc, busy, onPreview, onDownload }: { number: string; doc: Doc; busy: boolean; onPreview: () => void; onDownload: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-1.5">
      <button type="button" onClick={onPreview} className="h-10 w-10 shrink-0 overflow-hidden rounded border border-slate-200 bg-white [&_svg]:h-4 [&_svg]:w-4 [&_span]:hidden" aria-label={`Preview ${doc.label}`}>
        <Thumb number={number} doc={doc} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-slate-800" title={doc.fileName}>{doc.label}</p>
        <p className="truncate text-[11px] text-slate-500">{doc.date || '—'}{doc.generated ? ' · generated' : ''}{doc.isVideo ? ' · not in ZIP' : ''}</p>
      </div>
      <button type="button" onClick={onPreview} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" />Preview</button>
      <button type="button" disabled={busy} onClick={onDownload} className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-400 px-2 text-[12px] font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50" aria-label={`Download ${doc.label}`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</button>
    </div>
  );
}

/** One vehicle: details, a document checklist per section (NA when missing) with preview and download, details PDF and ZIP. */
export default function VehicleDocsDetail({ number }: { number: string }) {
  const pathname = usePathname();
  const prefix = pathname.startsWith('/employee') ? '/employee' : '/admin';
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; path: string; mimeType: string; download: () => void } | null>(null);
  const base = `/vehicle-docs/${encodeURIComponent(number)}`;

  useEffect(() => {
    let cancelled = false;
    api.get(base)
      .then((response) => { if (!cancelled) setVehicle(response.data as Vehicle); })
      .catch((caught) => { if (!cancelled) setError(caught?.response?.data?.error || 'Could not load this vehicle.'); });
    return () => { cancelled = true; };
  }, [base]);

  const run = async (key: string, path: string, fileName: string, done: string) => {
    setBusy(key);
    try {
      await downloadAuthedFile(path, fileName);
      toast.success(done);
    } catch (caught) {
      toast.error(await readBlobErrorMessage(caught, 'Download failed.'));
    } finally {
      setBusy(null);
    }
  };
  const downloadDoc = (doc: Doc) => run(doc.id, `${base}/files/${encodeURIComponent(doc.id)}`, doc.fileName, `${doc.label} downloaded.`);
  const downloadDetails = () => run('details', `${base}/details.pdf`, `${number} - Vehicle Details.pdf`, 'Vehicle details PDF downloaded.');
  const downloadZip = () => run('zip', `${base}/zip`, zipFileName(number), 'ZIP downloaded.');
  const downloadSectionZip = (section: string) => run(`zip:${section}`, `${base}/zip?section=${encodeURIComponent(section)}`, zipFileName(number, section), `${section} ZIP downloaded.`);

  if (error) return <div className="space-y-3"><Link href={vehicleDocsPath(prefix)} className={buttonLinkClass('secondary')}><ArrowLeft className="h-3.5 w-3.5" />All vehicles</Link><div className="rounded-lg border border-slate-200 bg-white"><ErrorBanner message={error} /></div></div>;
  if (!vehicle) return <div className="rounded-lg border border-slate-200 bg-white"><LoadingState /></div>;

  const facts: Array<[string, string | number | null]> = [
    ['Category', vehicle.category], ['Make / model', [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || null], ['Year', vehicle.year], ['Hours running', vehicle.hours],
    ['Chassis no.', vehicle.chassisNumber], ['Engine no.', vehicle.engineNumber], ['Owner', vehicle.owner], ['Location', vehicle.location],
  ];
  const inZip = vehicle.documents.filter((doc) => !doc.isVideo).length;
  const docsById = new Map(vehicle.documents.map((doc) => [doc.id, doc]));
  const available = vehicle.checklist.filter((item) => item.state === 'AVAILABLE').length;
  const activeSale = vehicle.sales.find((sale) => !sale.cancelledAt) ?? vehicle.sales[vehicle.sales.length - 1] ?? null;
  const listingHref = vehicle.listing ? `${prefix}/listings/${encodeURIComponent(vehicle.listing.id)}` : null;
  const saleHref = (id: string) => `${prefix}/accounts/sell-accounts/${encodeURIComponent(id)}`;
  // The number opens the vehicle's listing; without one, its Sold Vehicle record.
  const vehicleHref = listingHref ?? (activeSale ? saleHref(activeSale.id) : null);
  const badgeLink = 'rounded transition hover:opacity-80 hover:[&>span]:underline';
  const previewDoc = (doc: Doc) => setPreview({ title: doc.label, path: `${base}/files/${encodeURIComponent(doc.id)}?inline=1`, mimeType: doc.mimeType, download: () => void downloadDoc(doc) });
  const fileRow = (doc: Doc) => <FileRow key={doc.id} number={number} doc={doc} busy={busy === doc.id} onPreview={() => previewDoc(doc)} onDownload={() => void downloadDoc(doc)} />;

  return (
    <div className="space-y-3 tabular-nums">
      <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link href={vehicleDocsPath(prefix)} className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Vehicle Docs</Link>
          <h1 className="font-mono text-[18px] font-semibold leading-6 text-slate-900">
            {vehicleHref ? (
              <Link href={vehicleHref} className="inline-flex items-center gap-1 text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-amber-700 hover:decoration-amber-500" title={listingHref ? 'Open vehicle details (listing)' : 'Open Sold Vehicle record'}>
                {vehicle.vehicleNumber}<ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : vehicle.vehicleNumber}
          </h1>
          <p className="text-[13px] text-slate-600">{vehicle.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500">
            <span>Chassis no. <span className="font-mono font-medium text-slate-800">{vehicle.chassisNumber || '—'}</span></span>
            <span>Engine no. <span className="font-mono font-medium text-slate-800">{vehicle.engineNumber || '—'}</span></span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {vehicle.listing && listingHref ? <Link href={listingHref} className={badgeLink}><Badge tone={statusTone(vehicle.listing.status)}>Listing: {statusText(vehicle.listing.status)}</Badge></Link> : null}
            {vehicle.sales.map((sale) => <Link key={sale.id} href={saleHref(sale.id)} className={badgeLink}><Badge tone={statusTone(sale.cancelledAt ? 'CANCELLED' : sale.dealStatus)}>{sale.recordNumber}: {sale.cancelledAt ? 'Cancelled' : statusText(sale.dealStatus)}</Badge></Link>)}
            {vehicle.rto?.status ? <Link href={`${prefix}/accounts/rto-work-status/${encodeURIComponent(vehicle.rto.id)}`} className={badgeLink}><Badge tone={statusTone(vehicle.rto.status)}>RTO: {statusText(vehicle.rto.status)}</Badge></Link> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button icon={<Eye />} onClick={() => setPreview({ title: `${vehicle.vehicleNumber} - Vehicle Details`, path: `${base}/details.pdf?inline=1`, mimeType: 'application/pdf', download: () => void downloadDetails() })}>Preview details PDF</Button>
          <Button icon={<FileText />} busy={busy === 'details'} onClick={() => void downloadDetails()}>Details PDF</Button>
          <Button variant="primary" icon={<Download />} busy={busy === 'zip'} onClick={() => void downloadZip()}>Download all (ZIP)</Button>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h2 className="flex h-10 items-center border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-900">Vehicle</h2>
          <dl className="divide-y divide-slate-100 text-[13px]">
            {facts.map(([term, value]) => <div key={term} className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-[12px] text-slate-500">{term}</dt><dd className="truncate text-right text-slate-800">{value || '—'}</dd></div>)}
            {vehicle.listing ? <div className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-[12px] text-slate-500">Listed price</dt><dd className="text-right text-slate-800">{inr(vehicle.listing.finalPrice)}{vehicle.listing.partner ? <span className="block text-[11px] text-slate-500">by {vehicle.listing.partner}</span> : null}</dd></div> : null}
          </dl>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h2 className="flex h-10 items-center border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-900">Sale</h2>
          {!vehicle.sales.length ? <p className="px-3 py-3 text-[12px] text-slate-500">No Sold Vehicle record.</p> : vehicle.sales.map((sale) => (
            <div key={sale.id} className="border-b border-slate-100 px-3 py-2 text-[13px] last:border-0">
              <p className="font-medium text-slate-900">{sale.recordNumber}{sale.isDraft ? ' (draft)' : ''}{sale.cancelledAt ? ` (cancelled ${sale.cancelledAt})` : ''}</p>
              <p className="text-[12px] text-slate-600">Seller: {sale.sellerName || '—'} · Buyer: {sale.purchaserName || '—'}</p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 text-[12px]">
                <span className="text-slate-500">Sale amount</span><span className="text-right text-slate-900">{inr(sale.sellAmount)}</span>
                <span className="text-slate-500">Received</span><span className="text-right text-slate-900">{inr(sale.received)}</span>
                <span className="text-slate-500">Paid to seller</span><span className="text-right text-slate-900">{inr(sale.paidToSeller)}</span>
                <span className="text-slate-500">Bill of Supply</span><span className="text-right font-mono text-[11px] text-slate-900">{sale.invoiceNumber || '—'}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h2 className="flex h-10 items-center border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-900">RTO &amp; compliance</h2>
          {!vehicle.rto ? <p className="px-3 py-3 text-[12px] text-slate-500">No RTO record.</p> : (
            <dl className="divide-y divide-slate-100 text-[13px]">
              {([['RTO office', vehicle.rto.office || '—'], ['Tax', pairText(vehicle.rto.tax)], ['Fitness', pairText(vehicle.rto.fitness)], ['Insurance', pairText(vehicle.rto.insurance)], ['PUC', pairText(vehicle.rto.puc)], ['Hire purchase', [statusText(vehicle.rto.hirePurchase), vehicle.rto.financer].filter(Boolean).join(' · ') || '—']] as Array<[string, string]>).map(([term, value]) => (
                <div key={term} className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-[12px] text-slate-500">{term}</dt><dd className="truncate text-right text-slate-800">{value}</dd></div>
              ))}
              {vehicle.rto.tasks.length ? <div className="px-3 py-1.5 text-[12px] text-slate-600">Transfer: {vehicle.rto.tasks.filter((task) => task.status === 'TRANSFERRED' || task.status === 'NOT_REQUIRED').length} / {vehicle.rto.tasks.length} steps done</div> : null}
            </dl>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-[15px] font-semibold text-slate-900">Documents <span className="text-[13px] font-normal text-slate-500">· {available} of {vehicle.checklist.length} available · {vehicle.documents.length} files</span></h2>
        <span className="text-[12px] text-slate-500">{inZip} go in the ZIP{vehicle.documents.length > inZip ? ' · videos download separately' : ''}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {vehicle.sections.map((section) => {
          const items = vehicle.checklist.filter((item) => item.section === section);
          const extras = vehicle.documents.filter((doc) => doc.section === section && !doc.checklistKey);
          const sectionAvailable = items.filter((item) => item.state === 'AVAILABLE').length + (extras.length ? 1 : 0);
          const sectionTotal = items.length || 1;
          const zippable = vehicle.documents.filter((doc) => doc.section === section && !doc.isVideo).length;
          return (
            <section key={section} className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${section === 'Listing & Photos' || section === 'Other' ? 'xl:col-span-2' : ''}`}>
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-slate-900">{section}</h3>
                  <p className="truncate text-[11px] text-slate-500">{SECTION_HINTS[section] || ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={sectionAvailable >= sectionTotal ? 'green' : sectionAvailable ? 'amber' : 'slate'}>{Math.min(sectionAvailable, sectionTotal)} / {sectionTotal}</Badge>
                  <Button
                    icon={<FileArchive />}
                    busy={busy === `zip:${section}`}
                    disabled={!zippable || Boolean(busy?.startsWith('zip'))}
                    title={zippable ? `Download all ${section} files (${zippable}) as a ZIP` : 'No files in this section'}
                    onClick={() => void downloadSectionZip(section)}
                  >
                    ZIP
                  </Button>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const files = item.docIds.map((id) => docsById.get(id)).filter((doc): doc is Doc => Boolean(doc));
                  const photoGrid = item.key === 'listing-photos' && files.length > 0;
                  return (
                    <li key={item.key} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[13px] ${item.state === 'AVAILABLE' ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                          {item.label}
                          {item.note ? <span className="ml-1.5 text-[11px] font-normal text-slate-500">· {item.note}</span> : null}
                        </p>
                        <StateBadge item={item} />
                      </div>
                      {photoGrid ? (
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10">
                          {files.map((doc) => (
                            <button key={doc.id} type="button" onClick={() => previewDoc(doc)} className="h-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:opacity-90" title={doc.label} aria-label={`Preview ${doc.label}`}>
                              <Thumb number={number} doc={doc} />
                            </button>
                          ))}
                        </div>
                      ) : files.length ? <div className="mt-1.5 grid gap-1.5">{files.map(fileRow)}</div> : null}
                    </li>
                  );
                })}
                {extras.length ? <li className="grid gap-1.5 px-3 py-2">{extras.map(fileRow)}</li> : !items.length ? (
                  <li className="flex items-center justify-between px-3 py-2"><p className="text-[13px] text-slate-500">No other documents</p><span className="inline-flex h-5 items-center rounded border border-dashed border-slate-300 px-1.5 text-[11px] font-semibold text-slate-400">NA</span></li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      {!vehicle.documents.length ? <EmptyState title="No documents for this vehicle yet" description="Upload deeds and KYC copies on the Sold Vehicle record and proof on RTO Work tasks; Bill of Supply, receipts and refunds appear once issued." /> : null}

      {preview ? <PreviewModal title={preview.title} path={preview.path} mimeType={preview.mimeType} onClose={() => setPreview(null)} onDownload={preview.download} /> : null}
    </div>
  );
}
