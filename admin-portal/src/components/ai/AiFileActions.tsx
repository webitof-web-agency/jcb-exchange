'use client';

import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAiFileRequestPath, type AiFileAction } from './aiFileActionModel';

type AiFileActionsProps = {
  actions: readonly AiFileAction[];
};

const releaseObjectUrl = (objectUrl: string) => {
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export default function AiFileActions({ actions }: AiFileActionsProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleFile = async (action: AiFileAction, mode: 'view' | 'download') => {
    const requestPath = getAiFileRequestPath(action.url);
    if (!requestPath || (mode === 'view' && !action.previewable) || (mode === 'download' && !action.downloadable)) {
      toast.error('This file action is no longer available.');
      return;
    }

    const busyActionKey = `${mode}:${action.url}`;
    setBusyKey(busyActionKey);
    try {
      const response = await api.get<Blob>(requestPath, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.rel = 'noopener noreferrer';
      if (mode === 'download') {
        link.download = action.fileName || 'jcb-document';
      } else {
        link.target = '_blank';
      }
      document.body.appendChild(link);
      link.click();
      link.remove();
      releaseObjectUrl(objectUrl);
    } catch {
      toast.error(mode === 'view' ? 'File could not be opened.' : 'File could not be downloaded.');
    } finally {
      setBusyKey(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5" aria-label="Files returned by the assistant">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
        <FileText className="h-3.5 w-3.5 text-[#9A6700]" aria-hidden="true" />
        <span>Files</span>
      </div>
      {actions.map((action) => (
        <div key={`${action.url}:${action.fileName}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">{action.label}</p>
            <p className="truncate text-[10px] text-slate-500">{action.fileName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action.previewable ? (
              <button
                type="button"
                onClick={() => void handleFile(action, 'view')}
                disabled={busyKey !== null}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                aria-label={`View ${action.fileName}`}
                title="View file"
              >
                {busyKey === `view:${action.url}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
                <span>View</span>
              </button>
            ) : null}
            {action.downloadable ? (
              <button
                type="button"
                onClick={() => void handleFile(action, 'download')}
                disabled={busyKey !== null}
                className="inline-flex items-center gap-1 rounded-md bg-[#061532] px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-[#102652] disabled:cursor-wait disabled:opacity-60"
                aria-label={`Download ${action.fileName}`}
                title="Download file"
              >
                {busyKey === `download:${action.url}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Download className="h-3 w-3" aria-hidden="true" />}
                <span>Download</span>
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
