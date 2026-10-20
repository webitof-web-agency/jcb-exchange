'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Database, Download, Eye, FileText, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { ApiSparkleIcon } from '@/components/ui/ApiFillBadge';
import type { UploadedFileResult } from '@/lib/fileUpload';
import { SELL_ACCOUNT_DOCUMENT_ACCEPT } from '@/lib/sellAccountDocuments.mjs';
import { SELL_ACCOUNT_KYC_STATUS } from '@/lib/sellAccountKyc.mjs';
import { useTranslation } from '@/hooks/useTranslation';
import type { SellAccountDocument, SellAccountKycKind, SellAccountKycSide, SellAccountKycState } from './soldVehicleModel';

export type KycVerificationPreview = {
  side: 'purchase' | 'sell';
  kind: 'pan' | 'gst';
  number: string;
  response: Record<string, unknown>;
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const previewValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const previewLabel = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export function LegacyKycVerificationPreviewModal({ preview, onClose }: { preview: KycVerificationPreview; onClose: () => void }) {
  const record = isObject(preview.response.record) ? preview.response.record : {};
  const result = isObject(preview.response.result) ? preview.response.result : {};
  const downloadResult = () => {
    const blob = new Blob([JSON.stringify(preview.response, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${preview.kind.toUpperCase()}-${preview.number}-verification.json`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6" onMouseDown={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-violet-600">API verification preview</p>
            <h3 className="mt-1 truncate text-lg font-extrabold text-gray-950">{preview.kind.toUpperCase()} · {preview.number}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ['Side', preview.side === 'purchase' ? 'Purchase / Seller' : 'Sale / Customer'],
              ['Status', previewValue(record.status)],
              ['Provider', previewValue(record.provider)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                <p className="mt-1 break-words text-sm font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          <section className="mt-4">
            <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-700">Fetched API data</h4>
            {Object.keys(result).length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(result).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">{previewLabel(key)}</p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm font-semibold text-gray-900">{previewValue(value)}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">{JSON.stringify(preview.response, null, 2)}</pre>
            )}
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50/80 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100">Close</button>
          <button type="button" onClick={downloadResult} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 py-2 text-xs font-extrabold text-gray-950 shadow-sm hover:bg-amber-400">
            <Download className="h-3.5 w-3.5" />Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}

const organizedPreviewValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.map((item) => organizedPreviewValue(item)).join(', ');
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

type PanCardData = {
  pan: string;
  fullName: string;
  fatherName: string;
  dateOfBirth: string;
  maskedAadhaar: string;
};

const normalizePreviewKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const findPreviewField = (value: unknown, keys: string[]): unknown => {
  if (!isObject(value)) return undefined;
  const wantedKeys = new Set(keys.map(normalizePreviewKey));
  for (const [key, entryValue] of Object.entries(value)) {
    if (wantedKeys.has(normalizePreviewKey(key)) && entryValue !== null && entryValue !== undefined && entryValue !== '') {
      return entryValue;
    }
  }
  for (const entryValue of Object.values(value)) {
    const nestedValue = findPreviewField(entryValue, keys);
    if (nestedValue !== undefined) return nestedValue;
  }
  return undefined;
};

const buildPanCardData = (preview: KycVerificationPreview, result: Record<string, unknown>): PanCardData => ({
  pan: preview.number || organizedPreviewValue(findPreviewField(result, ['pan', 'panNumber'])),
  fullName: organizedPreviewValue(findPreviewField(result, ['fullName', 'name'])),
  fatherName: organizedPreviewValue(findPreviewField(result, ['fatherName', 'father', 'fathersName'])),
  dateOfBirth: organizedPreviewValue(findPreviewField(result, ['dateOfBirth', 'dob', 'birthDate'])),
  maskedAadhaar: organizedPreviewValue(findPreviewField(result, ['maskedAadhaar', 'maskedAadhar', 'aadhaar', 'aadhar'])),
});

const escapeSvgText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const createPanCardSvg = (data: PanCardData) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="880" viewBox="0 0 1400 880">
  <defs>
    <linearGradient id="panCardGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
    <linearGradient id="panAccentGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6D28D9"/><stop offset="50%" stop-color="#4F46E5"/><stop offset="100%" stop-color="#3B61D9"/>
    </linearGradient>
  </defs>
  <rect x="12" y="12" width="1376" height="856" rx="42" fill="url(#panCardGradient)" stroke="#c7d2fe" stroke-width="4"/>
  <rect x="12" y="12" width="1376" height="18" rx="9" fill="url(#panAccentGradient)"/>
  <circle cx="1180" cy="160" r="130" fill="#4F46E5" opacity="0.06"/>
  <circle cx="1280" cy="250" r="190" fill="#6D28D9" opacity="0.04"/>
  <rect x="76" y="82" width="128" height="128" rx="28" fill="url(#panAccentGradient)"/>
  <text x="140" y="164" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#ffffff">IN</text>
  <text x="238" y="116" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3" fill="#172033">PAN VERIFICATION COPY</text>
  <text x="238" y="158" font-family="Arial, sans-serif" font-size="22" letter-spacing="1" fill="#64748b">DIGITAL IDENTITY PREVIEW</text>
  <line x1="76" y1="270" x2="1324" y2="270" stroke="#c7d2fe" stroke-width="3"/>
  <text x="76" y="342" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#3B61D9">PERMANENT ACCOUNT NUMBER</text>
  <text x="76" y="410" font-family="Arial, sans-serif" font-size="48" font-weight="700" letter-spacing="5" fill="#172033">${escapeSvgText(data.pan)}</text>
  <text x="76" y="500" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#3B61D9">FULL NAME</text>
  <text x="76" y="548" font-family="Arial, sans-serif" font-size="30" font-weight="600" fill="#172033">${escapeSvgText(data.fullName)}</text>
  <text x="76" y="632" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#3B61D9">FATHER'S NAME</text>
  <text x="76" y="680" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#172033">${escapeSvgText(data.fatherName)}</text>
  <text x="780" y="500" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#3B61D9">DATE OF BIRTH</text>
  <text x="780" y="548" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#172033">${escapeSvgText(data.dateOfBirth)}</text>
  <text x="780" y="632" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#3B61D9">MASKED AADHAAR</text>
  <text x="780" y="680" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#172033">${escapeSvgText(data.maskedAadhaar)}</text>
  <line x1="76" y1="758" x2="1324" y2="758" stroke="#c7d2fe" stroke-width="3"/>
  <text x="76" y="812" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Generated from verified API data · Not an official government-issued card</text>
</svg>`;

function PanDigitalCard({ data }: { data: PanCardData }) {
  return (
    <section className="overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-3 shadow-sm">
      <div className="relative overflow-hidden rounded-lg border border-indigo-200 bg-white/75 p-4">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#4F46E5]/10" />
        <div className="pointer-events-none absolute -bottom-24 -right-8 h-52 w-52 rounded-full bg-[#6D28D9]/5" />
        <div className="relative flex items-start justify-between gap-3 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#6D28D9] via-[#4F46E5] to-[#3B61D9] text-sm font-bold text-white">IN</div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800">PAN verification copy</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-slate-500">Digital identity preview</p>
            </div>
          </div>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3B61D9]">Verified</span>
        </div>
        <div className="relative mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Permanent account number</p>
            <p className="mt-1 text-xl font-semibold tracking-[0.16em] text-slate-900">{data.pan}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Full name</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.fullName}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Father&apos;s name</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.fatherName}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Date of birth</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.dateOfBirth}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Masked Aadhaar</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.maskedAadhaar}</p>
          </div>
        </div>
        <p className="relative mt-3 border-t border-indigo-100 pt-2 text-[10px] text-slate-500">Generated from verified API data · Not an official government-issued card</p>
      </div>
    </section>
  );
}

const flattenPreviewFields = (value: Record<string, unknown>, prefix = ''): Array<[string, unknown]> => Object.entries(value).flatMap(([key, entryValue]) => {
  const label = prefix ? `${prefix} / ${previewLabel(key)}` : previewLabel(key);
  return isObject(entryValue) ? flattenPreviewFields(entryValue, label) : [[label, entryValue]];
});

function PreviewTable({ entries }: { entries: Array<[string, unknown]> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
      <table className="w-full table-fixed text-left">
        <tbody className="divide-y divide-indigo-50">
          {entries.map(([label, value]) => (
            <tr key={label} className="align-top transition hover:bg-indigo-50/35">
              <th className="w-[34%] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#3B61D9]">{label}</th>
              <td className="break-words whitespace-pre-wrap px-3 py-2 text-[13px] font-medium leading-5 text-slate-800">{organizedPreviewValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KycVerificationPreviewModal({ preview, onClose }: { preview: KycVerificationPreview; onClose: () => void }) {
  const record = isObject(preview.response.record) ? preview.response.record : {};
  const result = isObject(preview.response.result) ? preview.response.result : {};
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const overviewEntries = Object.entries(result).filter(([, value]) => !isObject(value));
  const groupedEntries = Object.entries(result).filter(([, value]) => isObject(value));
  const cacheHit = preview.response.cacheHit === true;
  const previewSource = cacheHit ? 'Temporary cache' : isObject(preview.response.record) ? 'Saved verification' : 'Live API';
  const panCardData = preview.kind === 'pan' ? buildPanCardData(preview, result) : null;

  const downloadResult = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { KycVerificationPreviewPdf } = await import('./KycVerificationPreviewPdf');
      const blob = await pdf(<KycVerificationPreviewPdf preview={preview} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${preview.kind.toUpperCase()}-${preview.number}-verification.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Verification PDF downloaded.');
    } catch (error) {
      console.error('Failed to generate verification PDF:', error);
      toast.error('Unable to generate verification PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const downloadPanImage = async (format: 'png' | 'jpeg') => {
    if (!panCardData || downloading) return;
    setDownloading(true);
    try {
      const image = new window.Image();
      const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createPanCardSvg(panCardData))}`;
      const loadedImage = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to render PAN card preview.'));
      });
      image.src = imageUrl;
      await loadedImage;

      const canvas = document.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 880;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((resultBlob) => {
          if (resultBlob) resolve(resultBlob);
          else reject(new Error('Unable to create image download.'));
        }, mimeType, 0.95);
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PAN-${panCardData.pan}-verification.${format === 'png' ? 'png' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`PAN ${format === 'png' ? 'PNG' : 'JPG'} downloaded.`);
    } catch (error) {
      console.error('Failed to generate PAN image:', error);
      toast.error('Unable to generate PAN image.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 px-3 py-4 sm:px-6" onMouseDown={onClose}>
      <div className="flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/20" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] bg-gradient-to-r from-[#6D28D9] via-[#4F46E5] to-[#3B61D9] bg-clip-text text-transparent">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4F46E5]" /> API verification preview
              </div>
              <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-slate-950 sm:text-lg">{preview.kind.toUpperCase()} <span className="text-slate-300">/</span> {preview.number}</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">Verified identity details received from the connected provider.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Database className="h-5 w-5 text-[#4F46E5]" aria-label="Fetched API data" />
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900" aria-label="Close preview">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-1.5 sm:grid-cols-4">
            {[
              ['Side', preview.side === 'purchase' ? 'Purchase / Seller' : 'Sale / Customer'],
              ['Status', organizedPreviewValue(record.status)],
              ['Provider', 'SUREPASS / Webitof'],
              ['Source', previewSource],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white/85 px-2.5 py-2 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">{label}</p>
                <p className={`mt-0.5 break-words text-xs font-semibold ${label === 'Status' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto bg-slate-50/70 px-4 py-3 sm:px-5">
          {panCardData ? <PanDigitalCard data={panCardData} /> : null}

          {overviewEntries.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Summary</h4>
              <PreviewTable entries={overviewEntries.map(([key, value]) => [previewLabel(key), value])} />
            </section>
          ) : null}

          {groupedEntries.map(([key, value]) => (
            <section key={key} className="mt-2.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">{previewLabel(key)}</h4>
              <PreviewTable entries={flattenPreviewFields(value as Record<string, unknown>)} />
            </section>
          ))}

          {!Object.keys(result).length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">No structured result fields were returned.</div>
          ) : null}

          <section className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => setShowRawResponse((current) => !current)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50">
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Raw response</span>
                <span className="mt-1 block text-xs text-slate-400">Original provider payload for audit or technical review.</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showRawResponse ? 'rotate-180' : ''}`} />
            </button>
            {showRawResponse ? <pre className="max-h-64 overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(preview.response, null, 2)}</pre> : null}
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Close</button>
          {panCardData ? (
            <>
              <button type="button" onClick={() => void downloadPanImage('png')} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> PNG
              </button>
              <button type="button" onClick={() => void downloadPanImage('jpeg')} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> JPG
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => void downloadResult()} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">
            <Download className="h-3.5 w-3.5" /> {downloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SellAccountPdfField({
  label,
  document,
  onUploaded,
  onUploadStateChange,
}: {
  label: string;
  document?: SellAccountDocument | null;
  onUploaded: (file: UploadedFileResult) => void;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-700">{label}</label>
      <FileUploadField
        accept={SELL_ACCOUNT_DOCUMENT_ACCEPT}
        visibility="secure"
        uploadedFileName={document?.originalName}
        uploadedFileMimeType={document?.mimeType}
        uploadedFileUrl={document?.fileUrl}
        onUploaded={onUploaded}
        onUploadStateChange={onUploadStateChange}
        helperText={t('sellAccounts.documentHelper', 'PDF up to 3MB or JPG, PNG, WEBP up to 5MB.')}
      />
    </div>
  );
}

export function DeedDocumentPreview({
  label,
  document,
  onRemove,
}: {
  label: string;
  document?: SellAccountDocument | null;
  onRemove?: () => void;
}) {
  const [viewerUrl, setViewerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const isImage = Boolean(
    document?.mimeType?.startsWith('image/') ||
    /\.(?:jpe?g|png|webp|gif)$/i.test(document?.originalName || '')
  );

  useEffect(() => {
    if (!document?.fileUrl) {
      return;
    }
    let cancelled = false;
    let createdUrl = '';
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
        if (cancelled) return;
        const mimeType = isImage
          ? (document.mimeType?.startsWith('image/') ? document.mimeType : response.data.type || 'image/*')
          : document.mimeType || 'application/pdf';
        const blob = new Blob([response.data], { type: mimeType });
        createdUrl = URL.createObjectURL(blob);
        setViewerUrl(createdUrl);
      } catch {
        if (!cancelled) setError('Unable to load document preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      setViewerUrl('');
    };
  }, [document?.fileUrl, document?.mimeType, isImage]);

  const downloadDocument = async () => {
    if (!document?.fileUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await api.get(normalizeSecureDocumentPath(document.fileUrl), { responseType: 'blob' });
      const blob = new Blob([response.data], { type: document.mimeType || 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = downloadUrl;
      a.download = document.originalName || `${label}.${isImage ? 'jpg' : 'pdf'}`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch {
      toast.error('Unable to download document.');
    } finally {
      setDownloading(false);
    }
  };

  if (!document?.fileUrl) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200/80 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{document.originalName || label}</p>
            <p className="text-[11px] text-gray-500">
              {isImage ? 'Image Document' : 'PDF Document'} · <span className="text-emerald-600 font-semibold">Uploaded</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition shadow-2xs"
          >
            <Eye className="h-3.5 w-3.5 text-gray-500" />
            {isOpen ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            type="button"
            onClick={() => void downloadDocument()}
            disabled={downloading}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition shadow-2xs disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-amber-700" />
            {downloading ? 'Downloading...' : 'Download'}
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs"
              title="Remove uploaded document"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="rounded-lg overflow-hidden bg-white border border-gray-200/90 min-h-[120px] flex items-center justify-center">
          {loading ? (
            <div className="py-8 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              Loading preview...
            </div>
          ) : error ? (
            <div className="py-6 text-center text-xs text-rose-500 font-medium">
              {error}
            </div>
          ) : viewerUrl ? (
            isImage ? (
              <div className="p-2 w-full flex justify-center bg-gray-900/5">
                <Image
                  src={viewerUrl}
                  alt={label}
                  width={700}
                  height={400}
                  unoptimized
                  className="max-h-72 w-auto object-contain rounded"
                />
              </div>
            ) : (
              <iframe
                title={label}
                src={viewerUrl}
                className="h-64 w-full rounded border-0"
              />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PanVerificationField({
  side,
  state,
  busyKey,
  onNumberChange,
  onVerify,
  previewAvailable = false,
  onPreview,
}: {
  side: 'purchase' | 'sell';
  state: SellAccountKycState;
  busyKey: string | null;
  onNumberChange: (value: string) => void;
  onVerify: () => void;
  previewAvailable?: boolean;
  onPreview?: () => void;
}) {
  const key = `${side}-pan`;
  const isVerified = state.status === SELL_ACCOUNT_KYC_STATUS.VERIFIED;
  const isFailed = state.status === SELL_ACCOUNT_KYC_STATUS.FAILED;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-gray-700">
          PAN number
        </label>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          isVerified
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : isFailed
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-gray-200 bg-gray-50 text-gray-600'
        }`}>
          {isVerified ? 'Verified' : isFailed ? 'Failed' : 'Not verified'}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <ApiSparkleIcon label="PAN data can be fetched or verified through API" className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            value={state.number}
            maxLength={10}
            onChange={(event) => onNumberChange(event.target.value)}
            placeholder="ABCDE1234F"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-gray-200 bg-[#F5F8FA] pl-10 pr-3.5 text-sm font-semibold uppercase text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
          />
        </div>
        <button
          type="button"
          onClick={onVerify}
          disabled={!state.number || busyKey === key}
          className="inline-flex min-w-24 items-center justify-center rounded-lg bg-[#FFC107] px-3 text-xs font-extrabold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
        >
          {busyKey === key ? 'Verifying...' : 'Verify'}
        </button>
      </div>
      {state.error ? (
        <p className="mt-1 text-xs font-medium text-rose-600">{state.error}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-500">10-digit alphanumeric PAN of {side === 'purchase' ? 'purchaser' : 'seller'}.</p>
      )}
      {previewAvailable && onPreview ? (
        <button type="button" onClick={onPreview} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 hover:underline">
          <Eye className="h-3.5 w-3.5" />Preview fetched data
        </button>
      ) : null}
    </div>
  );
}

export function SellAccountKycFields({
  side,
  values,
  busyKey,
  onNumberChange,
  onVerify,
  previewAvailable = false,
  onPreview,
}: {
  side: 'purchase' | 'sell';
  values: SellAccountKycSide;
  busyKey: string | null;
  onNumberChange: (kind: SellAccountKycKind, value: string) => void;
  onVerify: (kind: 'pan' | 'gst') => void;
  previewAvailable?: boolean;
  onPreview?: (kind: 'gst') => void;
}) {
  const statusLabel = (status: string) => {
    if (status === SELL_ACCOUNT_KYC_STATUS.VERIFIED) return 'Verified';
    if (status === SELL_ACCOUNT_KYC_STATUS.FAILED) return 'Failed';
    return 'Not verified';
  };

  const statusClass = (status: string) => status === SELL_ACCOUNT_KYC_STATUS.VERIFIED
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === SELL_ACCOUNT_KYC_STATUS.FAILED
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-gray-200 bg-gray-50 text-gray-600';

  const renderStatus = (state: SellAccountKycState) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(state.status)}`}>
      {statusLabel(state.status)}
    </span>
  );

  const renderVerificationField = (kind: 'gst', label: string, placeholder: string, state: SellAccountKycState) => {
    const key = `${side}-${kind}`;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-gray-700">{label}</label>
          {renderStatus(state)}
        </div>
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <ApiSparkleIcon label={`${label} data can be fetched or verified through API`} className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              value={state.number}
              onChange={(event) => onNumberChange(kind, event.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-gray-200 bg-[#F5F8FA] pl-10 pr-3.5 text-sm font-semibold uppercase text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
            />
          </div>
          <button
            type="button"
            onClick={() => onVerify(kind)}
            disabled={!state.number || busyKey === key}
            className="inline-flex min-w-24 items-center justify-center rounded-lg bg-[#FFC107] px-3 text-xs font-extrabold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
          >
            {busyKey === key ? 'Verifying...' : 'Verify'}
          </button>
        </div>
        {state.error ? <p className="mt-1 text-xs font-medium text-rose-600">{state.error}</p> : null}
        {previewAvailable && onPreview ? (
          <button type="button" onClick={() => onPreview('gst')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 hover:underline">
            <Eye className="h-3.5 w-3.5" />Preview fetched data
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {renderVerificationField('gst', 'GSTIN', '08ABCDE1234F1ZN', values.gst)}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-gray-700">Aadhaar / VID</label>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">Input only</span>
        </div>
        <div className="relative">
          <ApiSparkleIcon label="Aadhaar or VID data can be fetched through API when provider is configured" className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            value={values.aadhaar.number}
            onChange={(event) => onNumberChange('aadhaar', event.target.value)}
            placeholder="12-digit Aadhaar or VID"
            inputMode="numeric"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-gray-200 bg-[#F5F8FA] pl-10 pr-3.5 text-sm font-semibold text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">Aadhaar verification will be enabled after its provider is configured.</p>
      </div>
    </div>
  );
}
