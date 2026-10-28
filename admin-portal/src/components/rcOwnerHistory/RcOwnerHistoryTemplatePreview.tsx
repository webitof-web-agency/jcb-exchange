/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { getVerificationTemplateBlob } from '@/lib/panTemplateCache';
import type { RcOwnerHistoryResponse } from '@/lib/rcOwnerHistory';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 850;

const stringValue = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : '';
};

const formatRemaining = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The template image could not be read.'));
  reader.onerror = () => reject(new Error('The template image could not be read.'));
  reader.readAsDataURL(blob);
});

const safeFilePart = (value: string) => value.replace(/[^A-Z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase() || 'RC';

type Props = {
  response: RcOwnerHistoryResponse;
  onUploaded?: (response: RcOwnerHistoryResponse) => void;
};

export default function RcOwnerHistoryTemplatePreview({ response, onUploaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadedRef = useRef(false);
  const [remaining, setRemaining] = useState(() => response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() - Date.now() : 0);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadPngBusy, setDownloadPngBusy] = useState(false);
  const [error, setError] = useState('');

  const template = response.template ?? response.record.template ?? null;
  const result = useMemo(() => response.result || {}, [response.result]);
  const maskedRc = response.record.maskedRcNumber || 'RC';
  const hasResult = response.record.status === 'SUCCESS' && Boolean(response.result);

  useEffect(() => {
    if (template || !hasResult || uploadedRef.current) return;
    const expiry = response.record.rawDataExpiresAt ? new Date(response.record.rawDataExpiresAt).getTime() : 0;
    const tick = () => setRemaining(expiry - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hasResult, response.record.rawDataExpiresAt, template]);

  useEffect(() => {
    if (!template) return;
    let active = true;
    let objectUrl = '';
    getVerificationTemplateBlob(`rc-owner-history:${response.record.id}:${template.id}`, async () => {
      const result = await api.get<Blob>(`/rc-owner-history/${response.record.id}/template`, { responseType: 'blob' });
      return result.data;
    })
      .then((blob) => {
        if (!active) return;
        setTemplateBlob(blob);
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('The saved RC owner-history template could not be loaded.');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [response.record.id, template]);

  useEffect(() => {
    if (template || !hasResult) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ownerHistory = Array.isArray(result.ownerHistory) ? result.ownerHistory : [];
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, CANVAS_WIDTH, 142);
    context.fillStyle = '#f59e0b';
    context.fillRect(0, 142, CANVAS_WIDTH, 12);
    context.fillStyle = '#ffffff';
    context.font = '700 38px Arial, sans-serif';
    context.fillText('RC OWNER HISTORY VERIFICATION', 48, 68);
    context.font = '400 22px Arial, sans-serif';
    context.fillStyle = '#cbd5e1';
    context.fillText('Secure vehicle ownership history template', 48, 108);
    context.fillStyle = '#0f172a';
    context.font = '700 32px Arial, sans-serif';
    context.fillText('Vehicle registration', 48, 216);

    const drawField = (label: string, value: string, x: number, y: number, width = 500) => {
      context.fillStyle = '#64748b';
      context.font = '600 18px Arial, sans-serif';
      context.fillText(label.toUpperCase(), x, y);
      context.fillStyle = '#0f172a';
      context.font = '700 26px Arial, sans-serif';
      const text = value || 'Not available';
      context.fillText(text.length > 48 ? `${text.slice(0, 45)}...` : text, x, y + 36, width);
    };

    drawField('RC number', stringValue(result.rcNumber, maskedRc), 48, 278);
    drawField('Current owner', stringValue(result.ownerName), 650, 278, 480);
    drawField('Current owner number', stringValue(result.ownerNumber), 48, 382, 400);
    drawField('Provider client id', stringValue(result.providerClientId), 650, 382, 480);
    context.fillStyle = '#0f172a';
    context.font = '700 30px Arial, sans-serif';
    context.fillText('Owner history', 48, 500);
    context.fillStyle = '#e2e8f0';
    context.fillRect(48, 526, 1104, 2);
    context.fillStyle = '#64748b';
    context.font = '600 18px Arial, sans-serif';
    context.fillText('OWNER NUMBER', 80, 568);
    context.fillText('OWNER NAME', 350, 568);
    ownerHistory.slice(0, 10).forEach((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const y = 618 + index * 40;
      context.fillStyle = index % 2 ? '#f8fafc' : '#ffffff';
      context.fillRect(48, y - 27, 1104, 36);
      context.fillStyle = '#0f172a';
      context.font = '700 20px Arial, sans-serif';
      context.fillText(stringValue(item.ownerNumber), 80, y);
      context.font = '600 20px Arial, sans-serif';
      context.fillText(stringValue(item.ownerName) || 'Not available', 350, y);
    });
    if (!ownerHistory.length) {
      context.fillStyle = '#64748b';
      context.font = '600 20px Arial, sans-serif';
      context.fillText('No owner history returned', 80, 618);
    }
  }, [hasResult, maskedRc, result, template]);

  const getSourceBlob = async () => {
    if (templateBlob) return templateBlob;
    if (template) {
      const blob = await getVerificationTemplateBlob(`rc-owner-history:${response.record.id}:${template.id}`, async () => {
        const result = await api.get<Blob>(`/rc-owner-history/${response.record.id}/template`, { responseType: 'blob' });
        return result.data;
      });
      setTemplateBlob(blob);
      return blob;
    }
    const canvas = canvasRef.current;
    if (!canvas || canvas.width !== CANVAS_WIDTH) throw new Error('The RC owner-history template is still preparing.');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The RC owner-history template could not be prepared.');
    return blob;
  };

  const upload = async () => {
    if (!onUploaded || !hasResult || remaining <= 0) {
      setError('The five-minute template window has expired. Run RC owner-history verification again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await getSourceBlob();
      const formData = new FormData();
      formData.append('template', blob, `rc-owner-history-${safeFilePart(maskedRc)}.png`);
      const result = await api.post<RcOwnerHistoryResponse>(`/rc-owner-history/${response.record.id}/template`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      uploadedRef.current = true;
      setRemaining(0);
      setTemplateBlob(blob);
      onUploaded({ ...result.data, result: null, template: result.data.template ?? result.data.record.template });
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(typeof message.response?.data?.error === 'string' ? message.response.data.error : message.message || 'The RC owner-history template could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPng = async () => {
    setDownloadPngBusy(true);
    setError('');
    try {
      const blob = await getSourceBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rc-owner-history-template-${safeFilePart(maskedRc)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The RC owner-history PNG could not be prepared.');
    } finally {
      setDownloadPngBusy(false);
    }
  };

  const downloadPdf = async () => {
    setDownloadBusy(true);
    setError('');
    try {
      const image = await blobToDataUrl(await getSourceBlob());
      const { pdf } = await import('@react-pdf/renderer');
      const { RcOwnerHistoryTemplatePdfDocument } = await import('./RcOwnerHistoryTemplatePdfDocument');
      const pdfBlob = await pdf(<RcOwnerHistoryTemplatePdfDocument image={image} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rc-owner-history-template-${safeFilePart(maskedRc)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The RC owner-history PDF could not be prepared.');
    } finally {
      setDownloadBusy(false);
    }
  };

  if (!template && !hasResult) return null;
  const expired = remaining <= 0;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-linear-to-b from-slate-50 to-slate-100/60 p-4 shadow-xs sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-amber-600" /> RC Owner History Template</h3>
          <p className="mt-1 text-xs text-slate-500">Dynamic ownership history template from the Surepass result</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {template ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Template saved ({formatFileSize(template.fileSize)})</span> : <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}><ShieldCheck className="h-3.5 w-3.5" /> {expired ? 'Upload window expired' : `Upload within ${formatRemaining(remaining)}`}</span>}
          <button type="button" onClick={() => void downloadPng()} disabled={downloadPngBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" />{downloadPngBusy ? 'Preparing PNG...' : 'Download PNG'}</button>
          <button type="button" onClick={() => void downloadPdf()} disabled={downloadBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" />{downloadBusy ? 'Preparing PDF...' : 'Download PDF'}</button>
          {!template && onUploaded ? <button type="button" onClick={() => void upload()} disabled={busy || expired} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{busy ? 'Uploading...' : 'Upload & Save Template'}</button> : null}
        </div>
      </div>
      {error ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
      <div className="mt-4 flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_12px_30px_-5px_rgba(15,23,42,0.18)]">
        {template ? previewUrl ? <img src={previewUrl} alt="Saved RC owner-history template" className="h-auto max-h-[620px] w-full object-contain" /> : <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved template...</div> : <canvas ref={canvasRef} className="block h-auto w-full max-w-[900px] select-none" aria-label="Generated RC owner-history template" />}
      </div>
    </section>
  );
}
