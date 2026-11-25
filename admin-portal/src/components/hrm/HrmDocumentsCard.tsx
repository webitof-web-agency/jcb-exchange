'use client';

import { useRef, useState } from 'react';
import { Download, Eye, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrmApi, type HrmDocument, type HrmDocumentCategory } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';
import {
  checkDocumentFile,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_UPLOAD_TYPES,
  documentStatusClass,
  extensionForMime,
  hasStoredFile,
  indiaToday,
  UPLOAD_CATEGORIES,
} from '@/lib/hrmProfile';
import HrmModal from './HrmModal';

/** The document fields the profile reads (the API returns more than the shared type lists). */
type ProfileDocument = HrmDocument & { rejectionReason?: string | null; uploadedById?: string | null; fileSize?: number | null };

/**
 * The employee's documents: real file uploads (stored privately, PENDING until verified), view / download of every
 * stored file (uploads, the offer letter / acceptance certificate / signed copy from recruitment, verified KYC
 * templates) and verify / reject for people with hrm.documents.verify.
 */
export default function HrmDocumentsCard({
  employeeId,
  employeeCode,
  documents,
  canUpload,
  canView,
  canVerify,
  upload,
  onUploadChange,
  onChanged,
}: {
  employeeId: string;
  employeeCode: string;
  documents: ProfileDocument[];
  canUpload: boolean;
  canView: boolean;
  canVerify: boolean;
  /** Open upload dialog, with the category to preset (from the joining checklist). */
  upload: { category: HrmDocumentCategory } | null;
  onUploadChange: (next: { category: HrmDocumentCategory } | null) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ProfileDocument | null>(null);

  const openFile = async (document: ProfileDocument, mode: 'view' | 'download') => {
    if (busyId) return;
    // Open the tab now (still inside the click) so pop-up blockers allow it; it is filled when the file arrives.
    const tab = mode === 'view' ? window.open('', '_blank') : null;
    setBusyId(document.id);
    try {
      const response = await hrmApi.getDocumentFile(document.id);
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      if (mode === 'view' && tab) {
        tab.location.href = url;
      } else {
        const link = window.document.createElement('a');
        link.href = url;
        link.download = `${employeeCode}_${document.title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'document'}.${extensionForMime(blob.type)}`;
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      toast.error(getHrmErrorMessage(error, 'The file could not be opened.'));
    } finally {
      setBusyId(null);
    }
  };

  const verify = async (document: ProfileDocument) => {
    if (busyId) return;
    setBusyId(document.id);
    try {
      await hrmApi.decideDocument(document.id, { version: document.version, status: 'VERIFIED' });
      toast.success('Document verified.');
      await onChanged();
    } catch (error) {
      toast.error(getHrmErrorMessage(error, 'The document could not be verified.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section id="hrm-documents" aria-labelledby="hrm-documents-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-documents-title" className="font-bold text-slate-950">Documents</h2></div>
        {canUpload ? <button type="button" onClick={() => onUploadChange({ category: 'OTHER' })} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-500"><Upload className="h-3.5 w-3.5" /> Upload</button> : null}
      </div>
      {documents.length ? (
        <ul className="mt-3 space-y-2">
          {documents.map((document) => {
            const stored = hasStoredFile(document);
            const busy = busyId === document.id;
            return (
              <li key={document.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{document.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {DOCUMENT_CATEGORY_LABELS[document.category as HrmDocumentCategory] ?? formatHrmStatus(document.category)}
                      {document.createdAt ? ` · added ${formatHrmDate(document.createdAt)}` : ''}
                      {document.expiresAt ? ` · expires ${formatHrmDate(document.expiresAt)}` : ''}
                      {stored ? '' : ' · paper / note only'}
                    </p>
                    {document.status === 'REJECTED' && document.rejectionReason ? <p className="mt-0.5 text-[11px] text-rose-700">Rejected: {document.rejectionReason}</p> : null}
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${documentStatusClass(document.status)}`}>{formatHrmStatus(document.status)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] font-bold">
                  {stored && canView ? <>
                    <button type="button" disabled={busy} onClick={() => void openFile(document, 'view')} className="inline-flex items-center gap-1 text-slate-700 hover:text-amber-700 disabled:opacity-50">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} View</button>
                    <button type="button" disabled={busy} onClick={() => void openFile(document, 'download')} className="inline-flex items-center gap-1 text-slate-700 hover:text-amber-700 disabled:opacity-50"><Download className="h-3 w-3" /> Download</button>
                  </> : null}
                  {canVerify && document.status === 'PENDING' ? <>
                    <button type="button" disabled={busy} onClick={() => void verify(document)} className="text-emerald-700 hover:underline disabled:opacity-50">Verify</button>
                    <button type="button" disabled={busy} onClick={() => setRejecting(document)} className="text-rose-700 hover:underline disabled:opacity-50">Reject</button>
                  </> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 text-sm text-slate-500">No documents yet.{canUpload ? ' Upload the photo, certificates and proofs here.' : ''}</p>}

      {upload ? <UploadDocumentDialog employeeId={employeeId} presetCategory={upload.category} onClose={() => onUploadChange(null)} onDone={async () => { onUploadChange(null); await onChanged(); }} /> : null}
      {rejecting ? <RejectDocumentDialog document={rejecting} onClose={() => setRejecting(null)} onDone={async () => { setRejecting(null); await onChanged(); }} /> : null}
    </section>
  );
}

function UploadDocumentDialog({ employeeId, presetCategory, onClose, onDone }: { employeeId: string; presetCategory: HrmDocumentCategory; onClose: () => void; onDone: () => Promise<void> }) {
  const [category, setCategory] = useState<HrmDocumentCategory>(presetCategory);
  const [title, setTitle] = useState(presetCategory === 'OTHER' ? '' : DOCUMENT_CATEGORY_LABELS[presetCategory]);
  const [file, setFile] = useState<File | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileProblem = file ? checkDocumentFile(file, category) : null;

  const submit = async () => {
    if (saving) return;
    const problem = checkDocumentFile(file, category);
    if (problem) { setError(problem); return; }
    if (!title.trim()) { setError('Give the document a title.'); return; }
    if (title.trim().length > 160) { setError('The title can be at most 160 characters.'); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.uploadDocument(employeeId, { file: file!, category, title: title.trim(), expiresAt: expiresAt || null });
      toast.success('Document uploaded. It waits for verification.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The document could not be uploaded.'));
    } finally { setSaving(false); }
  };

  return (
    <HrmModal title="Upload document" description="PDF, JPG, PNG or WEBP, up to 5 MB. Stored privately; it is verified before it counts." onClose={onClose} busy={saving} lockDismiss={saving || Boolean(file)} size="md" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{saving ? 'Uploading…' : 'Upload'}</button>
      </>}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">Category
          <select value={category} disabled={saving} onChange={(event) => { const next = event.target.value as HrmDocumentCategory; setCategory(next); if (!title.trim() || title === DOCUMENT_CATEGORY_LABELS[category]) setTitle(next === 'OTHER' ? '' : DOCUMENT_CATEGORY_LABELS[next]); }} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
            {UPLOAD_CATEGORIES.map((value) => <option key={value} value={value}>{DOCUMENT_CATEGORY_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700">Title<input value={title} disabled={saving} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="For example B.Com marksheet" className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
        <div>
          <p className="text-xs font-semibold text-slate-700">File</p>
          <input ref={inputRef} type="file" accept={category === 'PHOTO' ? 'image/jpeg,image/png,image/webp' : DOCUMENT_UPLOAD_TYPES.join(',')} disabled={saving} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-800" />
          {file ? <p className={`mt-1 text-[11px] ${fileProblem ? 'text-rose-700' : 'text-slate-500'}`}>{fileProblem ?? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}</p> : null}
        </div>
        <label className="block text-xs font-semibold text-slate-700">Expires on (optional)<input type="date" min={indiaToday()} value={expiresAt} disabled={saving} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
      </div>
    </HrmModal>
  );
}

function RejectDocumentDialog({ document, onClose, onDone }: { document: ProfileDocument; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (saving) return;
    if (reason.trim().length < 3) { setError('Give the reason the document is rejected.'); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.decideDocument(document.id, { version: document.version, status: 'REJECTED', rejectionReason: reason.trim() });
      toast.success('Document rejected.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The document could not be rejected.'));
    } finally { setSaving(false); }
  };
  return (
    <HrmModal title="Reject document" description={document.title} onClose={onClose} busy={saving} lockDismiss={saving} size="sm" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Reject</button>
      </>}>
      <label className="block text-xs font-semibold text-slate-700">Reason<textarea rows={3} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Blurred, wrong document, expired…" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label>
    </HrmModal>
  );
}
