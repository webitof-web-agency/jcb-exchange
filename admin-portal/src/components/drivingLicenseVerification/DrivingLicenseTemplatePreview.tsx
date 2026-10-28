/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { getVerificationTemplateBlob } from '@/lib/panTemplateCache';
import type { DrivingLicenseResultResponse } from '@/lib/drivingLicenseVerification';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 760;

const stringValue = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : '';
};

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
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

const safeFilePart = (value: string) => value.replace(/[^A-Z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase() || 'CARD';

type Props = {
  response: DrivingLicenseResultResponse;
  onUploaded?: (response: DrivingLicenseResultResponse) => void;
};

export default function DrivingLicenseTemplatePreview({ response, onUploaded }: Props) {
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
  const maskedLicense = response.record.maskedLicenseNumber || 'LICENSE';
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
    getVerificationTemplateBlob(`${response.record.id}:${template.id}`, async () => {
      const result = await api.get<Blob>(`/driving-license-verification/${response.record.id}/template`, { responseType: 'blob' });
      return result.data;
    })
      .then((blob) => {
        if (!active) return;
        setTemplateBlob(blob);
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError('The saved driving-license template could not be loaded.');
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
    const name = stringValue(result.name);
    const licenseNumber = stringValue(result.licenseNumber, maskedLicense);
    const dob = formatDate(result.dob);
    const state = stringValue(result.state);
    const authority = stringValue(result.issuingAuthority);
    const expiry = formatDate(result.expiryDate);
    const classes = Array.isArray(result.vehicleClasses) ? result.vehicleClasses.join(', ') : stringValue(result.vehicleClasses);
    const address = stringValue(result.permanentAddress);

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
    context.fillText('DRIVING LICENSE VERIFICATION', 48, 68);
    context.font = '400 22px Arial, sans-serif';
    context.fillStyle = '#cbd5e1';
    context.fillText('Secure verification template', 48, 108);
    context.fillStyle = '#0f172a';
    context.font = '700 32px Arial, sans-serif';
    context.fillText('License details', 48, 216);

    const drawField = (label: string, value: string, x: number, y: number, width = 500) => {
      context.fillStyle = '#64748b';
      context.font = '600 18px Arial, sans-serif';
      context.fillText(label.toUpperCase(), x, y);
      context.fillStyle = '#0f172a';
      context.font = '700 26px Arial, sans-serif';
      const text = value || 'Not available';
      context.fillText(text.length > 42 ? `${text.slice(0, 39)}...` : text, x, y + 36, width);
    };

    drawField('License number', licenseNumber, 48, 278);
    drawField('Vehicle classes', classes, 700, 278, 400);
    drawField('Name', name, 48, 382);
    drawField('Date of birth', dob, 48, 486, 350);
    drawField('State', state, 430, 486, 350);
    drawField('Issuing authority', authority, 48, 590, 600);
    drawField('Expiry date', expiry, 700, 590, 350);
    if (address) drawField('Permanent address', address, 48, 694, 1000);
  }, [hasResult, maskedLicense, result, template]);

  const getSourceBlob = async () => {
    if (templateBlob) return templateBlob;
    if (template) {
      const blob = await getVerificationTemplateBlob(`${response.record.id}:${template.id}`, async () => {
        const result = await api.get<Blob>(`/driving-license-verification/${response.record.id}/template`, { responseType: 'blob' });
        return result.data;
      });
      setTemplateBlob(blob);
      return blob;
    }
    const canvas = canvasRef.current;
    if (!canvas || canvas.width !== CANVAS_WIDTH) throw new Error('The driving-license template is still preparing.');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The driving-license template could not be prepared.');
    return blob;
  };

  const upload = async () => {
    if (!onUploaded || !hasResult || remaining <= 0) {
      setError('The five-minute template window has expired. Run driving-license verification again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await getSourceBlob();
      const formData = new FormData();
      formData.append('template', blob, `driving-license-${safeFilePart(maskedLicense)}.png`);
      const result = await api.post<DrivingLicenseResultResponse>(`/driving-license-verification/${response.record.id}/template`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      uploadedRef.current = true;
      setRemaining(0);
      setTemplateBlob(blob);
      onUploaded({ ...result.data, result: null, template: result.data.template ?? result.data.record.template });
    } catch (requestError) {
      const message = requestError as { response?: { data?: { error?: unknown } }; message?: string };
      setError(typeof message.response?.data?.error === 'string' ? message.response.data.error : message.message || 'The driving-license template could not be uploaded.');
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
      link.download = `driving-license-template-${safeFilePart(maskedLicense)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The driving-license PNG could not be prepared.');
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
      const { DrivingLicenseTemplatePdfDocument } = await import('./DrivingLicenseTemplatePdfDocument');
      const pdfBlob = await pdf(<DrivingLicenseTemplatePdfDocument image={image} />).toBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `driving-license-template-${safeFilePart(maskedLicense)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The driving-license PDF could not be prepared.');
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
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-amber-600" /> Driving License Template</h3>
          <p className="mt-1 text-xs text-slate-500">Dynamic verification template from the Surepass result</p>
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
        {template ? previewUrl ? <img src={previewUrl} alt="Saved driving-license template" className="h-auto max-h-[620px] w-full object-contain" /> : <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved template...</div> : <canvas ref={canvasRef} className="block h-auto w-full max-w-[900px] select-none" aria-label="Generated driving-license template" />}
      </div>
    </section>
  );
}
