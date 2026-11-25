'use client';

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Award, CheckCircle2, Download, Loader2 } from 'lucide-react';
import {
  apiErrorMessage,
  describeAcceptanceMethod,
  offerHrmApi,
  shortHash,
  signatureFileLabel,
  type StoredOfferAcceptance,
} from '@/lib/offerHrm';

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
};

/** The cross-origin API does not expose Content-Disposition, so the extension comes from the file type. */
const extensionForType = (type: string | undefined) => (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'bin');

const fileNameFrom = (disposition: unknown, fallback: string) => {
  const match = typeof disposition === 'string' ? /filename="?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] || fallback;
};

/**
 * How an accepted offer was accepted, with downloads of the acceptance certificate and the signed copy / signature.
 * The downloads (GET /recruitment/admin/offers/:id/acceptance/:kind) need recruitment.offers.read: pass
 * `canDownload={false}` for viewers without it (for example an application reviewer).
 */
export default function OfferAcceptanceSummary({
  offerId,
  applicationRef,
  acceptance,
  canDownload = true,
}: {
  offerId: string;
  applicationRef: string;
  acceptance: StoredOfferAcceptance;
  canDownload?: boolean;
}) {
  const [downloading, setDownloading] = useState<'certificate' | 'signature' | null>(null);

  const download = async (kind: 'certificate' | 'signature') => {
    if (downloading) return;
    setDownloading(kind);
    try {
      const response = await offerHrmApi.downloadAcceptanceFile(offerId, kind);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFrom(response.headers?.['content-disposition'], kind === 'certificate' ? `Offer_Acceptance_${applicationRef}.pdf` : `Offer_Signature_${applicationRef}.${extensionForType((response.data as Blob)?.type)}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The file could not be downloaded.'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-950">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Acceptance
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <div><dt className="font-semibold text-emerald-800">Accepted by</dt><dd className="font-bold">{acceptance.name || '-'}</dd></div>
        <div><dt className="font-semibold text-emerald-800">How</dt><dd className="font-bold">{describeAcceptanceMethod(acceptance.method)}</dd></div>
        <div><dt className="font-semibold text-emerald-800">Place</dt><dd className="font-bold">{acceptance.place || '-'}</dd></div>
        <div><dt className="font-semibold text-emerald-800">When</dt><dd className="font-bold">{formatDateTime(acceptance.acceptedAt)}</dd></div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-emerald-800">Offer letter fingerprint (SHA-256)</dt>
          <dd className="font-mono font-bold" title={acceptance.documentHash ?? undefined}>{shortHash(acceptance.documentHash)}</dd>
        </div>
      </dl>
      {!canDownload && (acceptance.hasCertificate || acceptance.hasSignatureFile) ? (
        <p className="mt-3 text-[11px] font-semibold text-emerald-800">Downloading the acceptance files needs the recruitment.offers.read permission.</p>
      ) : null}
      {canDownload ? <div className="mt-3 flex flex-wrap gap-2">
        {acceptance.hasCertificate ? (
          <button type="button" onClick={() => void download('certificate')} disabled={Boolean(downloading)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
            {downloading === 'certificate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />} Download certificate
          </button>
        ) : null}
        {acceptance.hasSignatureFile ? (
          <button type="button" onClick={() => void download('signature')} disabled={Boolean(downloading)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">
            {downloading === 'signature' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {signatureFileLabel(acceptance.method)}
          </button>
        ) : null}
      </div> : null}
    </div>
  );
}
