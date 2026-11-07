'use client';

import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, FileText, Info, ShieldCheck, XCircle } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import PartnerKycTemplateModal from '@/components/kyc/PartnerKycTemplateModal';
import PartnerAuthKycFields from '@/components/partner/PartnerAuthKycFields';
import type { GstResultResponse } from '@/lib/gstVerification';
import { hasGstTemplateContent, type PartnerGstVerificationResponse } from '@/lib/partnerGstVerification';
import { useAuthStore } from '@/store/authStore';

export default function PartnerAuthPage() {
  const user = useAuthStore((state) => state.user);
  const [data, setData] = useState<PartnerGstVerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<PartnerGstVerificationResponse>('/auth/partner/gst-verification')
      .then((response) => {
        if (!active) return;
        setData(response.data);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const response = requestError as { response?: { data?: { error?: unknown } } };
        setError(typeof response.response?.data?.error === 'string'
          ? response.response.data.error
          : 'Unable to load your GST verification details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (user?.role && user.role !== 'PARTNER') {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
        GST verification details are available for partner accounts only.
      </div>
    );
  }

  if (loading) {
    return <BrandLoader variant="section" size="md" bg="light" text="Loading GST verification details..." className="rounded-2xl border border-slate-200 bg-white" />;
  }

  const hasVerifiedGst = Boolean(data?.available && data.record && hasGstTemplateContent(data));
  const gstResponse = hasVerifiedGst ? data as GstResultResponse : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {hasVerifiedGst && data && data.record && gstResponse ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Partner business identity</p>
                  <h1 className="mt-1 text-xl font-bold tracking-tight">Auth</h1>
                  <p className="mt-1 text-xs text-slate-300">Verified GST information retained from your signup/onboarding verification.</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-300/30">
                <CheckCircle2 className="h-4 w-4" /> {data.record.gstinStatus || 'Verified'}
              </span>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GSTIN</p>
                <p className="mt-1 break-all text-sm font-black tracking-wide text-slate-900">{data.record.maskedGstin || data.gstNumber || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legal name</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{data.record.legalName || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last verified</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {data.record.completedAt ? new Date(data.record.completedAt).toLocaleString('en-IN') : '-'}
                </p>
              </div>
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>GST-verified values are shown as read-only. Signup/KYC fields and GST-verified contact details are kept separate for audit clarity.</p>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-purple-600" /> GST Template</h2>
                <p className="mt-1 text-xs text-slate-500">Open the same verified multi-page template preview used in KYC.</p>
              </div>
              <button
                type="button"
                onClick={() => setTemplatePreviewOpen(true)}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                View template
              </button>
            </div>
          </section>

          {templatePreviewOpen ? (
            <PartnerKycTemplateModal
              documentType="GST_CERTIFICATE"
              documentNumber={data.gstNumber || data.record.maskedGstin}
              response={gstResponse}
              isPartnerMode
              templateEndpointBaseOverride="/auth/partner/kyc/GST_CERTIFICATE"
              onClose={() => setTemplatePreviewOpen(false)}
              onSaved={() => setTemplatePreviewOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">GST verification not available yet</h1>
              <p className="mt-1 text-sm text-slate-600">Complete the KYC details below. Once GST is verified, the authenticated business details and template will appear here automatically.</p>
            </div>
          </div>
        </section>
      )}

      <PartnerAuthKycFields gst={hasVerifiedGst ? data : null} />
    </div>
  );
}
