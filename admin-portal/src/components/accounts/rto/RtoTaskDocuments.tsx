'use client';

import { useRef, useState } from 'react';
import { Download, Eye, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getUploadValidationError, uploadFileToServer } from '@/lib/fileUpload';
import { createSecureDocumentPreviewUrl, downloadSecureDocument } from '@/lib/secureDownload';

export type RtoTaskDocument = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedByName?: string | null;
};

const MAX_TASK_DOCUMENTS = 5;

const apiError = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof detail === 'string' && detail.trim() ? detail : error instanceof Error && error.message ? error.message : fallback;
};

const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes > 0 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : '');

/**
 * Proof files for one Ownership Transfer Task (RC copy, insurance policy, NOC...). Files go to secure storage
 * and also appear on Accounts → Vehicle Docs under "RTO Transfer".
 */
export default function RtoTaskDocuments<TWorkspace>({
  recordId,
  taskId,
  taskLabel,
  documents,
  canEdit,
  onWorkspace,
}: {
  recordId: string;
  taskId: string;
  taskLabel: string;
  documents: RtoTaskDocument[];
  canEdit: boolean;
  onWorkspace: (workspace: TWorkspace) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/recruitment/admin/rto-records/${encodeURIComponent(recordId)}/transfer-tasks/${encodeURIComponent(taskId)}/documents`;

  const upload = async (file: File) => {
    const invalid = getUploadValidationError(file);
    if (invalid) { toast.error(invalid); return; }
    setBusy('upload');
    try {
      const uploaded = await uploadFileToServer({ file, visibility: 'secure' });
      const response = await api.post<TWorkspace>(base, uploaded);
      onWorkspace(response.data);
      toast.success(`${taskLabel}: ${uploaded.originalName || 'document'} uploaded.`);
    } catch (error) {
      toast.error(apiError(error, 'Unable to upload the document.'));
    } finally {
      setBusy(null);
    }
  };

  const preview = async (document: RtoTaskDocument) => {
    // Open the tab before the fetch so the browser does not treat it as a pop-up.
    const tab = window.open('', '_blank');
    setBusy(document.id);
    try {
      const url = await createSecureDocumentPreviewUrl(document.fileUrl, document.fileName);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      toast.error(apiError(error, 'Unable to open the document.'));
    } finally {
      setBusy(null);
    }
  };

  const download = async (document: RtoTaskDocument) => {
    setBusy(document.id);
    try {
      await downloadSecureDocument(document.fileUrl, document.fileName);
    } catch (error) {
      toast.error(apiError(error, 'Unable to download the document.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (document: RtoTaskDocument) => {
    if (!window.confirm(`Remove "${document.fileName}" from ${taskLabel}?`)) return;
    setBusy(document.id);
    try {
      const response = await api.delete<TWorkspace>(`${base}/${encodeURIComponent(document.id)}`);
      onWorkspace(response.data);
      toast.success('Document removed.');
    } catch (error) {
      toast.error(apiError(error, 'Unable to remove the document.'));
    } finally {
      setBusy(null);
    }
  };

  if (!documents.length && !canEdit) return null;

  return (
    <div className="ml-10 mt-1.5 flex flex-wrap items-center gap-1.5">
      {documents.map((document) => (
        <span key={document.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-gray-50 py-0.5 pl-2 pr-0.5 text-[11px] text-gray-700" title={[document.fileName, fileSize(document.size), document.uploadedByName].filter(Boolean).join(' · ')}>
          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
          <button type="button" onClick={() => void preview(document)} disabled={busy === document.id} className="max-w-[180px] truncate font-medium hover:text-gray-900 hover:underline">{document.fileName}</button>
          {busy === document.id ? <Loader2 className="mx-1 h-3 w-3 animate-spin text-gray-400" /> : (
            <>
              <button type="button" onClick={() => void preview(document)} className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700" aria-label={`Preview ${document.fileName}`}><Eye className="h-3 w-3" /></button>
              <button type="button" onClick={() => void download(document)} className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700" aria-label={`Download ${document.fileName}`}><Download className="h-3 w-3" /></button>
              {canEdit ? <button type="button" onClick={() => void remove(document)} className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-red-600" aria-label={`Remove ${document.fileName}`}><X className="h-3 w-3" /></button> : null}
            </>
          )}
        </span>
      ))}
      {canEdit && documents.length < MAX_TASK_DOCUMENTS ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <button type="button" disabled={busy === 'upload'} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-600 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60">
            {busy === 'upload' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {documents.length ? 'Add file' : 'Upload document'}
          </button>
        </>
      ) : null}
    </div>
  );
}
