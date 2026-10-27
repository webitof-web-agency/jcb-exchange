'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Database, Download, Eye, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { FileUploadField } from '@/components/upload/FileUploadField';
import { ApiSparkleIcon } from '@/components/ui/ApiFillBadge';
import PanCardTemplate, { type PanCardData } from '@/components/pancard/PanCardTemplate';
import AadhaarCardTemplate, { type AadhaarCardData } from '@/components/aadhaar/AadhaarCardTemplate';
import type { UploadedFileResult } from '@/lib/fileUpload';
import { SELL_ACCOUNT_DOCUMENT_ACCEPT } from '@/lib/sellAccountDocuments.mjs';
import { SELL_ACCOUNT_KYC_STATUS } from '@/lib/sellAccountKyc.mjs';
import { getGeneratedKycDocumentFileName, getGeneratedKycDocumentKey, getGeneratedKycUploadLabel } from '@/lib/kycGeneratedDocument.mjs';
import { useTranslation } from '@/hooks/useTranslation';
import type { SellAccountDocument, SellAccountDocumentKey, SellAccountKycKind, SellAccountKycSide, SellAccountKycState } from './soldVehicleModel';
import { buildPanCardData as buildVerifiedPanCardData } from './panCardVerification.mjs';
import { buildPanCardExportSvg } from './panCardExport.mjs';
import { buildAadhaarCardData, hasAadhaarCardData } from './aadhaarVerification.mjs';
import { getGstPreviewFields, getUnmaskedGstPreviewResult, removeMaskedGstFields } from '@/lib/gstVerificationPreview';

export type KycVerificationPreview = {
  side: 'purchase' | 'sell';
  kind: 'pan' | 'gst' | 'aadhaar';
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

type VerificationPanCardData = PanCardData & { maskedAadhaar?: string };

const buildPanCardData = (preview: KycVerificationPreview, result: Record<string, unknown>): VerificationPanCardData =>
  buildVerifiedPanCardData(preview, result) as VerificationPanCardData;

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error || new Error('Unable to read image data.'));
  reader.readAsDataURL(blob);
});

const inlineImageSources = async (root: HTMLElement) => {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async (image) => {
    const source = image.getAttribute('src');
    if (!source || source.startsWith('data:')) return;
    try {
      const response = await fetch(new URL(source, window.location.href), { credentials: 'include' });
      if (!response.ok) throw new Error(`Unable to load PAN card image (${response.status}).`);
      image.setAttribute('src', await blobToDataUrl(await response.blob()));
    } catch (error) {
      console.warn('PAN card image could not be embedded in the export.', error);
      image.removeAttribute('src');
      image.style.display = 'none';
    }
  }));

  const allWithBg = Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.style.backgroundImage && el.style.backgroundImage.includes('url(')
  );
  await Promise.all(allWithBg.map(async (el) => {
    const match = el.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (!match || !match[1] || match[1].startsWith('data:')) return;
    try {
      const response = await fetch(new URL(match[1], window.location.href), { credentials: 'include' });
      if (response.ok) {
        const dataUrl = await blobToDataUrl(await response.blob());
        el.style.backgroundImage = `url("${dataUrl}")`;
      }
    } catch (e) {
      console.warn('Background image could not be embedded in export.', e);
    }
  }));
};

const inlineComputedStyles = (source: Element, clone: Element) => {
  const computed = window.getComputedStyle(source);
  const targetStyle = (clone as HTMLElement | SVGElement).style;
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    targetStyle.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  }

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  sourceChildren.forEach((child, index) => {
    const clonedChild = cloneChildren[index];
    if (clonedChild) inlineComputedStyles(child, clonedChild);
  });
};

const captureCardAsDataUrl = async (container: HTMLDivElement, selector: string, format: 'png' | 'jpeg') => {
  const surface = container.querySelector<HTMLElement>(selector);
  if (!surface) throw new Error('Identity card preview is not ready.');

  // Use the card's layout size so the compact on-screen scale never reduces exports.
  const width = Math.ceil(surface.offsetWidth || 490);
  const height = Math.ceil(surface.offsetHeight || 309);
  const clone = surface.cloneNode(true) as HTMLElement;
  inlineComputedStyles(surface, clone);
  clone.style.transform = 'none';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  await inlineImageSources(clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = buildPanCardExportSvg({ width, height, markup: serialized });
  const image = new window.Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to render PAN card image.'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.scale(2, 2);
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95);
};

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to prepare identity card image.'));
  image.src = source;
});

const combineCardImages = async (sources: string[], format: 'png' | 'jpeg') => {
  const images = await Promise.all(sources.map(loadImage));
  const width = Math.max(...images.map((image) => image.naturalWidth || image.width));
  const height = images.reduce((total, image) => total + (image.naturalHeight || image.height), 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  let top = 0;
  images.forEach((image) => {
    const imageHeight = image.naturalHeight || image.height;
    context.drawImage(image, 0, top, width, imageHeight);
    top += imageHeight;
  });
  return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95);
};

/* Legacy SVG card renderer removed; exports now capture the real PanCardTemplate.


  <text x="76" y="812" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Generated from verified API data · Not an official government-issued card</text>
</svg>`;
*/

/* Legacy custom verification card retained only in history; modal now renders PanCardTemplate.
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
            <p className="mt-1 text-xl font-semibold tracking-[0.16em] text-slate-900">{data.panNumber}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Full name</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Father&apos;s name</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.fatherName}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Date of birth</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{data.dob}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Masked Aadhaar</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{(data as VerificationPanCardData).maskedAadhaar}</p>
          </div>
        </div>
        <p className="relative mt-3 border-t border-indigo-100 pt-2 text-[10px] text-slate-500">Generated from verified API data · Not an official government-issued card</p>
      </div>
    </section>
  );
}

*/

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

type KycGeneratedDocumentUpload = (file: File, documentKey: SellAccountDocumentKey) => Promise<UploadedFileResult>;

export function KycVerificationPreviewModal({
  preview,
  onClose,
  onSaveToKyc,
}: {
  preview: KycVerificationPreview;
  onClose: () => void;
  onSaveToKyc?: KycGeneratedDocumentUpload;
}) {
  const record = isObject(preview.response.record) ? preview.response.record : {};
  const rawResult = isObject(preview.response.result) ? preview.response.result : {};
  const result = preview.kind === 'gst' ? getUnmaskedGstPreviewResult(rawResult, preview.number) : rawResult;
  const displayResponse = preview.kind === 'gst'
    ? removeMaskedGstFields(preview.response) as Record<string, unknown>
    : preview.response;
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadingKyc, setUploadingKyc] = useState(false);
  const [kycUploadError, setKycUploadError] = useState('');
  const [uploadedKycDocument, setUploadedKycDocument] = useState<UploadedFileResult | null>(null);
  const [aadhaarSide, setAadhaarSide] = useState<'front' | 'back'>('front');
  const panCardContainerRef = useRef<HTMLDivElement>(null);
  const aadhaarFrontExportRef = useRef<HTMLDivElement>(null);
  const aadhaarBackExportRef = useRef<HTMLDivElement>(null);
  const overviewEntries = Object.entries(result).filter(([, value]) => !isObject(value));
  const groupedEntries = Object.entries(result).filter(([, value]) => isObject(value));
  const cacheHit = preview.response.cacheHit === true;
  const previewSource = cacheHit ? 'Temporary cache' : isObject(preview.response.record) ? 'Saved verification' : 'Live API';
  const panCardData = preview.kind === 'pan' ? buildPanCardData(preview, result) : null;
  const aadhaarCardData = preview.kind === 'aadhaar' ? buildAadhaarCardData(preview, result) as AadhaarCardData : null;
  const showAadhaarCard = Boolean(aadhaarCardData && hasAadhaarCardData(aadhaarCardData));
  const gstPreviewFields = preview.kind === 'gst' ? getGstPreviewFields(result) : [];
  const generatedDocumentKey = getGeneratedKycDocumentKey(preview);

  const captureAadhaarCards = async (format: 'png' | 'jpeg') => {
    if (!aadhaarFrontExportRef.current || !aadhaarBackExportRef.current) throw new Error('Aadhaar card preview is not ready.');
    const front = await captureCardAsDataUrl(aadhaarFrontExportRef.current, '[data-aadhaar-card-surface="front"]', format);
    const back = await captureCardAsDataUrl(aadhaarBackExportRef.current, '[data-aadhaar-card-surface="back"]', format);
    return combineCardImages([front, back], format);
  };

  const buildVerificationPdf = async () => {
    const { pdf } = await import('@react-pdf/renderer');
    const { KycVerificationPreviewPdf } = await import('./KycVerificationPreviewPdf');
    const panCardImage = panCardData && panCardContainerRef.current
      ? await captureCardAsDataUrl(panCardContainerRef.current, '[data-pan-card-surface="true"]', 'png')
      : undefined;
    const aadhaarCardImage = showAadhaarCard ? await captureAadhaarCards('png') : undefined;
    return pdf(<KycVerificationPreviewPdf preview={preview} panCardImage={panCardImage} aadhaarCardImage={aadhaarCardImage} />).toBlob();
  };

  const downloadResult = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await buildVerificationPdf();
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
    if (!panCardData || !panCardContainerRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await captureCardAsDataUrl(panCardContainerRef.current, '[data-pan-card-surface="true"]', format);
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PAN-${panCardData.panNumber}-verification.${format === 'png' ? 'png' : 'jpg'}`;
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

  const saveToKyc = async () => {
    if (!onSaveToKyc || !generatedDocumentKey || uploadingKyc) return;
    setUploadingKyc(true);
    setKycUploadError('');
    try {
      const blob = await buildVerificationPdf();
      const file = new File([blob], getGeneratedKycDocumentFileName(preview), {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
      const uploaded = await onSaveToKyc(file, generatedDocumentKey);
      setUploadedKycDocument(uploaded);
      toast.success(`${preview.kind === 'aadhaar' ? 'Aadhaar' : 'PAN'} document uploaded to KYC.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload the verification document.';
      setKycUploadError(message);
      toast.error(message);
    } finally {
      setUploadingKyc(false);
    }
  };

  const downloadAadhaarImage = async (format: 'png' | 'jpeg') => {
    if (!showAadhaarCard || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await captureAadhaarCards(format);
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AADHAAR-${aadhaarCardData?.aadhaarNumber || 'verification'}-front-back.${format === 'png' ? 'png' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Aadhaar ${format === 'png' ? 'PNG' : 'JPG'} downloaded.`);
    } catch (error) {
      console.error('Failed to generate Aadhaar image:', error);
      toast.error('Unable to generate Aadhaar image.');
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
          {panCardData ? (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">PAN card preview</p>
                  <p className="mt-0.5 text-xs text-slate-500">Verified details filled into the PAN card template.</p>
                </div>
                {panCardData.maskedAadhaar ? <span className="text-[11px] font-medium text-slate-500">Masked Aadhaar: {panCardData.maskedAadhaar}</span> : null}
              </div>
              <div ref={panCardContainerRef} className="overflow-x-auto rounded-lg bg-slate-50 p-3" aria-label="PAN card preview">
                <div className="flex h-[260px] min-w-[430px] justify-center overflow-hidden">
                  <PanCardTemplate data={panCardData} interactive={false} scale={0.84} />
                </div>
              </div>
            </section>
          ) : null}

          {showAadhaarCard && aadhaarCardData ? (
            <section className="relative mt-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">Aadhaar card preview</p>
                  <p className="mt-0.5 text-xs text-slate-500">Fetched Aadhaar fields filled into the front and back templates.</p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button type="button" onClick={() => setAadhaarSide('front')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${aadhaarSide === 'front' ? 'bg-white text-[#3B61D9] shadow-sm' : 'text-slate-500'}`} aria-label="Show Aadhaar front">
                    <ArrowLeft className="h-3 w-3" /> Front
                  </button>
                  <button type="button" onClick={() => setAadhaarSide('back')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${aadhaarSide === 'back' ? 'bg-white text-[#3B61D9] shadow-sm' : 'text-slate-500'}`} aria-label="Show Aadhaar back">
                    Back <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg bg-slate-50 p-3" aria-label={`Aadhaar ${aadhaarSide} preview`}>
                <div className="flex h-[260px] min-w-[430px] justify-center overflow-hidden">
                  <AadhaarCardTemplate data={aadhaarCardData} interactive={false} scale={0.84} side={aadhaarSide} />
                </div>
              </div>
              <div className="absolute left-[-10000px] top-0 h-[309px] w-[490px]" aria-hidden="true">
                <div ref={aadhaarFrontExportRef}>
                  <AadhaarCardTemplate data={aadhaarCardData} interactive={false} scale={1} side="front" />
                </div>
                <div ref={aadhaarBackExportRef}>
                  <AadhaarCardTemplate data={aadhaarCardData} interactive={false} scale={1} side="back" />
                </div>
              </div>
            </section>
          ) : null}

          {gstPreviewFields.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3B61D9]">GSTIN details</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Verified business details returned by the Surepass GSTIN API.</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Verified data</span>
              </div>
              <PreviewTable entries={gstPreviewFields} />
            </section>
          ) : null}

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
            {showRawResponse ? <pre className="max-h-64 overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(displayResponse, null, 2)}</pre> : null}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5">
          {generatedDocumentKey && onSaveToKyc ? (
            <div className="mr-auto min-w-[220px] flex-1" role="status" aria-live="polite">
              {uploadedKycDocument ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                  <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Uploaded to KYC</p>
                  <p className="mt-0.5 truncate text-[10px] text-emerald-700">{uploadedKycDocument.originalName || uploadedKycDocument.fileName}</p>
                </div>
              ) : kycUploadError ? (
                <p className="text-[11px] font-medium text-rose-600">{kycUploadError}</p>
              ) : null}
            </div>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Close</button>
          {generatedDocumentKey && onSaveToKyc ? (
            <button type="button" onClick={() => void saveToKyc()} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">
              {uploadingKyc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {getGeneratedKycUploadLabel({ uploading: uploadingKyc, hasUploadedDocument: Boolean(uploadedKycDocument) })}
            </button>
          ) : null}
          {panCardData ? (
            <>
              <button type="button" onClick={() => void downloadPanImage('png')} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> PNG
              </button>
              <button type="button" onClick={() => void downloadPanImage('jpeg')} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> JPG
              </button>
            </>
          ) : null}
          {showAadhaarCard ? (
            <>
              <button type="button" onClick={() => void downloadAadhaarImage('png')} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> Aadhaar PNG
              </button>
              <button type="button" onClick={() => void downloadAadhaarImage('jpeg')} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B61D9] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3B61D9] transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> Aadhaar JPG
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => void downloadResult()} disabled={downloading || uploadingKyc} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">
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
                className="h-[560px] min-h-[500px] w-full rounded border-0"
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
  aadhaarPreviewAvailable = false,
  onPreview,
}: {
  side: 'purchase' | 'sell';
  values: SellAccountKycSide;
  busyKey: string | null;
  onNumberChange: (kind: SellAccountKycKind, value: string) => void;
  onVerify: (kind: 'pan' | 'gst' | 'aadhaar') => void;
  previewAvailable?: boolean;
  aadhaarPreviewAvailable?: boolean;
  onPreview?: (kind: 'gst' | 'aadhaar') => void;
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
          <label className="block text-xs font-semibold text-gray-700">Aadhaar number</label>
          {renderStatus(values.aadhaar)}
        </div>
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <ApiSparkleIcon label="Aadhaar data can be fetched through DigiLocker" className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              value={values.aadhaar.number}
              onChange={(event) => onNumberChange('aadhaar', event.target.value)}
              placeholder="12-digit Aadhaar"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              className="h-9 w-full rounded-lg border border-gray-200 bg-[#F5F8FA] pl-10 pr-3.5 text-sm font-semibold text-gray-900 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:outline-none transition"
            />
          </div>
          <button
            type="button"
            onClick={() => onVerify('aadhaar')}
            disabled={!values.aadhaar.number || busyKey === `${side}-aadhaar`}
            className="inline-flex min-w-24 items-center justify-center rounded-lg bg-[#FFC107] px-3 text-xs font-extrabold text-gray-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-xs"
          >
            {busyKey === `${side}-aadhaar` ? 'Verifying...' : 'Verify'}
          </button>
        </div>
        {values.aadhaar.error ? <p className="mt-1 text-xs font-medium text-rose-600">{values.aadhaar.error}</p> : <p className="mt-1 text-xs text-gray-500">12-digit Aadhaar verification via DigiLocker.</p>}
        {aadhaarPreviewAvailable && onPreview ? (
          <button type="button" onClick={() => onPreview('aadhaar')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 hover:underline">
            <Eye className="h-3.5 w-3.5" />Preview fetched data
          </button>
        ) : null}
      </div>
    </div>
  );
}
