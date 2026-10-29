'use client';

import { X } from 'lucide-react';
import AadhaarTemplatePreview, {
  type AadhaarData,
  type AadhaarTemplateInfo,
} from '@/components/identityHub/AadhaarTemplatePreview';
import GstTemplatePreview from '@/components/identityHub/GstTemplatePreview';
import PanTemplatePreview from '@/components/identityHub/PanTemplatePreview';
import type { PanResultResponse } from '@/lib/panVerification';
import type { GstResultResponse } from '@/lib/gstVerification';

export type PartnerAadhaarTemplateResponse = {
  success?: boolean;
  cacheHit?: boolean;
  record: {
    id: string;
    status?: string;
    maskedAadhaar: string;
    providerClientId?: string | null;
    rawDataExpiresAt?: string | null;
    template?: AadhaarTemplateInfo | null;
  };
  result: AadhaarData | null;
  template?: AadhaarTemplateInfo | null;
};

export type PartnerTemplateResponse = PanResultResponse | GstResultResponse | PartnerAadhaarTemplateResponse;

type Props = {
  documentType: 'PAN_CARD' | 'GST_CERTIFICATE' | 'AADHAAR_CARD';
  documentNumber: string;
  response: PartnerTemplateResponse;
  isPartnerMode: boolean;
  templateEndpointBaseOverride?: string;
  onClose: () => void;
  onSaved: (response: PartnerTemplateResponse) => void;
};

const isPanResponse = (response: PartnerTemplateResponse): response is PanResultResponse =>
  'record' in response && 'maskedPan' in response.record;

const isGstResponse = (response: PartnerTemplateResponse): response is GstResultResponse =>
  'record' in response && 'maskedGstin' in response.record;

const isAadhaarResponse = (response: PartnerTemplateResponse): response is PartnerAadhaarTemplateResponse =>
  'record' in response && 'maskedAadhaar' in response.record;

export default function PartnerKycTemplateModal({
  documentType,
  documentNumber,
  response,
  isPartnerMode,
  templateEndpointBaseOverride,
  onClose,
  onSaved,
}: Props) {
  const endpointBase = templateEndpointBaseOverride || (isPartnerMode
    ? `/auth/partner/kyc/${documentType}`
    : documentType === 'PAN_CARD'
      ? '/pan-verification'
      : documentType === 'GST_CERTIFICATE'
        ? '/gst-verification'
        : '/aadhaar-verification');

  const handleSaved = (nextResponse: PartnerTemplateResponse) => {
    onSaved(nextResponse);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label={`${documentType} template preview`}>
      <div className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">Verified template preview</p>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              {documentType === 'PAN_CARD' ? 'PAN card template' : documentType === 'GST_CERTIFICATE' ? 'GST certificate template' : 'Aadhaar template'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="Close template preview">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
          {documentType === 'PAN_CARD' && isPanResponse(response) ? (
            <PanTemplatePreview
              response={response}
              panNumber={documentNumber}
              templateEndpointBase={endpointBase}
              allowOptionalAssets={false}
              onUploaded={handleSaved}
            />
          ) : null}
          {documentType === 'GST_CERTIFICATE' && isGstResponse(response) ? (
            <GstTemplatePreview
              response={response}
              templateEndpointBase={endpointBase}
              onUploaded={handleSaved}
            />
          ) : null}
          {documentType === 'AADHAAR_CARD' && isAadhaarResponse(response) ? (
            <AadhaarTemplatePreview
              data={response.result}
              inputAadhaarNumber={documentNumber}
              recordId={response.record.id}
              recordMaskedAadhaar={response.record.maskedAadhaar}
              template={response.template ?? response.record.template ?? null}
              templateEndpointBase={endpointBase}
              onUploaded={(template) => handleSaved({ ...response, result: null, template, record: { ...response.record, template } })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
