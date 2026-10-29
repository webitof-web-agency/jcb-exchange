'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type { GstResultResponse } from '@/lib/gstVerification';
import { getVerificationTemplateBlob } from '@/lib/panTemplateCache';

const formatRemaining = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatFileSize = (value: number) => `${Math.max(1, Math.round(value / 1024))} KB`;

const getErrorMessage = (error: unknown, fallback: string) => {
  const requestError = error as { response?: { data?: { error?: unknown } }; message?: string };
  return typeof requestError.response?.data?.error === 'string'
    ? requestError.response.data.error
    : requestError.message || fallback;
};

const toPdfBlob = async (response: GstResultResponse) => {
  const { pdf } = await import('@react-pdf/renderer');
  const { GstCertificatePdfDocument } = await import('@/components/gstVerification/GstCertificatePdfDocument');
  const { mapGstVerificationToCertificate } = await import('@/lib/gstCertificateMapper');
  const certificate = mapGstVerificationToCertificate(response as unknown as Record<string, unknown>);
  return pdf(<GstCertificatePdfDocument data={certificate} />).toBlob();
};

type Props = {
  response: GstResultResponse;
  onUploaded?: (response: GstResultResponse) => void;
  templateEndpointBase?: string;
};

export default function GstTemplatePreview({ response, onUploaded, templateEndpointBase = '/gst-verification' }: Props) {
  const template = response.template ?? response.record.template;
  const [remaining, setRemaining] = useState(() => response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() - Date.now() : 0);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState('');
  const uploadedRef = useRef(false);

  useEffect(() => {
    if (template || !response.result || uploadedRef.current) return;
    const expiry = response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() : 0;
    const tick = () => setRemaining(expiry - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [response.record.rawDataExpiresAt, response.result, template]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const load = async () => {
      try {
        const blob = template
          ? await getVerificationTemplateBlob(`${response.record.id}:${template.id}`, async () => {
              const result = await api.get<Blob>(`${templateEndpointBase}/${response.record.id}/template`, { responseType: 'blob' });
              return result.data;
            })
          : response.result
            ? await toPdfBlob(response)
            : null;
        if (!blob || !active) return;
        setTemplateBlob(blob);
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError, 'The GST template could not be prepared.'));
      }
    };
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [response, response.record.id, template, templateEndpointBase]);

  const downloadPdf = async () => {
    setDownloadBusy(true);
    setError('');
    try {
      const blob = templateBlob || (template
        ? await getVerificationTemplateBlob(`${response.record.id}:${template.id}`, async () => {
            const result = await api.get<Blob>(`${templateEndpointBase}/${response.record.id}/template`, { responseType: 'blob' });
            return result.data;
          })
        : await toPdfBlob(response));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gst-verification-template-${response.record.maskedGstin.replace(/[^A-Z0-9]/gi, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The GST PDF could not be prepared.'));
    } finally {
      setDownloadBusy(false);
    }
  };

  const upload = async () => {
    if (!onUploaded || !response.result || remaining <= 0) {
      setError('The five-minute template window has expired. Run GST verification again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = templateBlob || await toPdfBlob(response);
      const formData = new FormData();
      formData.append('template', blob, `gst-${response.record.maskedGstin.replace(/[^A-Z0-9]/gi, '')}.pdf`);
      const result = await api.post<GstResultResponse>(`${templateEndpointBase}/${response.record.id}/template`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      uploadedRef.current = true;
      setRemaining(0);
      onUploaded({ ...result.data, result: null, template: result.data.template ?? result.data.record.template });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The GST template could not be uploaded.'));
    } finally {
      setBusy(false);
    }
  };

  if (!template && !response.result) return null;
  const expired = remaining <= 0;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-b from-slate-50 to-slate-100/60 p-4 shadow-xs sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-purple-600" /> GST Template</h3>
          <p className="mt-1 text-xs text-slate-500">Generated verification template from the Surepass result</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {template ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Saved template ({formatFileSize(template.fileSize)})</span>
          ) : onUploaded && response.result ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}><ShieldCheck className="h-3.5 w-3.5" /> {expired ? 'Upload window expired' : `Upload within ${formatRemaining(remaining)}`}</span>
          ) : null}
          <button type="button" onClick={downloadPdf} disabled={downloadBusy || !previewUrl && !templateBlob && !response.result} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" />{downloadBusy ? 'Preparing PDF...' : 'Download PDF'}</button>
          {!template && onUploaded && response.result ? <button type="button" onClick={() => void upload()} disabled={busy || expired} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{busy ? 'Uploading...' : 'Upload template'}</button> : null}
        </div>
      </div>
      {error ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
      <div className="mt-4 flex min-h-[360px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_30px_-5px_rgba(15,23,42,0.18)]">
        {previewUrl ? <iframe src={previewUrl} title="GST verification template" className="h-[560px] w-full border-0" /> : <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Preparing template preview...</div>}
      </div>
    </section>
  );
}
