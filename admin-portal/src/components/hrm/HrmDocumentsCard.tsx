'use client';

import { useState } from 'react';
import { Download, Eye, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'react-toastify';
import { hrmApi, type HrmDocument, type HrmDocumentCategory } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';
import {
  checkDocumentFile,
  cleanText,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_UPLOAD_TYPES,
  documentStatusClass,
  documentTitleProblem,
  extensionForMime,
  hasStoredFile,
  indiaToday,
  UPLOAD_CATEGORIES,
} from '@/lib/hrmProfile';
import {
  defaultDocumentTitle,
  DOCUMENT_ORIGIN_LABELS,
  documentKindLabel,
  documentOrigin,
  visibleDocumentGroups,
  type DocumentGroupId,
  type DocumentOrigin,
} from '@/lib/hrmDocuments';
import HrmModal from './HrmModal';

/** The document fields the profile reads (the API returns more than the shared type lists). */
type ProfileDocument = HrmDocument & { rejectionReason?: string | null; uploadedById?: string | null; fileSize?: number | null };

/** The upload dialog: `category` fixed (opened from a group or a checklist item), or null to choose it. */
export type DocumentUploadRequest = { category: HrmDocumentCategory | null };

const ORIGIN_CLASS: Record<DocumentOrigin, string> = {
  OFFER: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  KYC: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  EMPLOYEE: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  HR: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

/**
 * The employee's documents grouped by type: files that came with the accepted offer or KYC, and files uploaded by
 * hand (stored privately, PENDING until verified). View / download, verify / reject for people with
 * hrm.documents.verify. With `focus` only that group is shown.
 */
export default function HrmDocumentsCard({
  employeeId,
  employeeCode,
  employeeUserId,
  documents,
  canUpload,
  canView,
  canVerify,
  focus,
  upload,
  onUploadChange,
  onChanged,
}: {
  employeeId: string;
  employeeCode: string;
  employeeUserId: string | null;
  documents: ProfileDocument[];
  canUpload: boolean;
  canView: boolean;
  canVerify: boolean;
  focus: DocumentGroupId | null;
  upload: DocumentUploadRequest | null;
  onUploadChange: (next: DocumentUploadRequest | null) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ProfileDocument | null>(null);
  const groups = visibleDocumentGroups(documents, focus);

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

  const renderDocument = (document: ProfileDocument) => {
    const stored = hasStoredFile(document);
    const busy = busyId === document.id;
    const origin = documentOrigin(document, employeeUserId);
    const kind = documentKindLabel(document);
    return (
      <li key={document.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-slate-800">{document.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <span className={`inline-flex rounded-full px-2 py-0.5 font-bold ring-1 ring-inset ${ORIGIN_CLASS[origin]}`}>{DOCUMENT_ORIGIN_LABELS[origin]}</span>
            {kind !== document.title ? <span>{kind}</span> : null}
            {document.createdAt ? <span>Added {formatHrmDate(document.createdAt)}</span> : null}
            {document.expiresAt ? <span>Expires {formatHrmDate(document.expiresAt)}</span> : null}
            {stored ? null : <span>Paper / note only</span>}
          </p>
          {document.status === 'REJECTED' && document.rejectionReason ? <p className="mt-1 text-[11px] text-rose-700">Rejected: {document.rejectionReason}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${documentStatusClass(document.status)}`}>{formatHrmStatus(document.status)}</span>
          {stored && canView ? <>
            <button type="button" disabled={busy} onClick={() => void openFile(document, 'view')} aria-label={`View ${document.title}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} View</button>
            <button type="button" disabled={busy} onClick={() => void openFile(document, 'download')} aria-label={`Download ${document.title}`} title="Download" className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download className="h-3.5 w-3.5" /></button>
          </> : null}
          {canVerify && document.status === 'PENDING' ? <>
            <button type="button" disabled={busy} onClick={() => void verify(document)} className="min-h-8 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Verify</button>
            <button type="button" disabled={busy} onClick={() => setRejecting(document)} className="min-h-8 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button>
          </> : null}
        </div>
      </li>
    );
  };

  return (
    <section id="hrm-documents" aria-labelledby="hrm-documents-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-documents-title" className="font-bold text-slate-950">Documents</h2></div>
        {canUpload && !focus ? <button type="button" onClick={() => onUploadChange({ category: null })} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><Upload className="h-3.5 w-3.5 text-amber-600" /> Upload other document</button> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG or WEBP up to 5 MB. A file uploaded by hand counts after it is verified.</p>

      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
              <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
              {canUpload ? (
                <div className="flex flex-wrap gap-2">
                  {group.uploads.map((upload_) => (
                    <button key={upload_.category} type="button" onClick={() => onUploadChange({ category: upload_.category })} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-500"><Upload className="h-3.5 w-3.5" /> {upload_.label}</button>
                  ))}
                </div>
              ) : null}
            </div>
            {group.documents.length ? (
              <ul className="divide-y divide-slate-100">{group.documents.map(renderDocument)}</ul>
            ) : <p className="px-3 py-3 text-xs text-slate-500">Nothing uploaded yet.</p>}
            {group.help ? <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-500">{group.help}</p> : null}
          </div>
        ))}
      </div>

      {upload ? <UploadDocumentDialog employeeId={employeeId} fixedCategory={upload.category} onClose={() => onUploadChange(null)} onDone={async () => { onUploadChange(null); await onChanged(); }} /> : null}
      {rejecting ? <RejectDocumentDialog document={rejecting} onClose={() => setRejecting(null)} onDone={async () => { setRejecting(null); await onChanged(); }} /> : null}
    </section>
  );
}

function UploadDocumentDialog({ employeeId, fixedCategory, onClose, onDone }: { employeeId: string; fixedCategory: HrmDocumentCategory | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [category, setCategory] = useState<HrmDocumentCategory>(fixedCategory ?? 'OTHER');
  const [title, setTitle] = useState(defaultDocumentTitle(fixedCategory ?? 'OTHER'));
  const [file, setFile] = useState<File | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileProblem = file ? checkDocumentFile(file, category) : null;
  const typeLabel = category === 'ACCEPTANCE' ? 'Signed offer letter' : DOCUMENT_CATEGORY_LABELS[category];

  const submit = async () => {
    if (saving) return;
    const problem = checkDocumentFile(file, category) ?? documentTitleProblem(title);
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.uploadDocument(employeeId, { file: file!, category, title: cleanText(title), expiresAt: expiresAt || null });
      toast.success('Document uploaded. It waits for verification.');
      await onDone();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The document could not be uploaded.'));
    } finally { setSaving(false); }
  };

  return (
    <HrmModal title={fixedCategory ? `Upload: ${typeLabel}` : 'Upload document'} description="PDF, JPG, PNG or WEBP, up to 5 MB. Stored privately; it is verified before it counts." onClose={onClose} busy={saving} lockDismiss={saving || Boolean(file)} size="md" error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{saving ? 'Uploading…' : 'Upload'}</button>
      </>}>
      <div className="space-y-3">
        {fixedCategory ? null : (
          <label className="block text-xs font-semibold text-slate-700">Document type
            <select value={category} disabled={saving} onChange={(event) => { const next = event.target.value as HrmDocumentCategory; if (!title.trim() || title === defaultDocumentTitle(category)) setTitle(defaultDocumentTitle(next)); setCategory(next); }} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal">
              {UPLOAD_CATEGORIES.map((value) => <option key={value} value={value}>{DOCUMENT_CATEGORY_LABELS[value]}</option>)}
            </select>
          </label>
        )}
        <div>
          <p className="text-xs font-semibold text-slate-700">File</p>
          <input type="file" accept={category === 'PHOTO' ? 'image/jpeg,image/png,image/webp' : DOCUMENT_UPLOAD_TYPES.join(',')} disabled={saving} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(''); }} className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-800" />
          {file ? <p className={`mt-1 text-[11px] ${fileProblem ? 'text-rose-700' : 'text-slate-500'}`}>{fileProblem ?? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}</p> : null}
        </div>
        <label className="block text-xs font-semibold text-slate-700">Title<input value={title} disabled={saving} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="For example B.Com marksheet" className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label>
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
    if (cleanText(reason).length < 3) { setError('Give the reason the document is rejected.'); return; }
    setSaving(true); setError('');
    try {
      await hrmApi.decideDocument(document.id, { version: document.version, status: 'REJECTED', rejectionReason: cleanText(reason) });
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
