'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Mail, MapPin, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';

type LegalPageKey = 'termsConditions' | 'privacyPolicy' | 'disclaimer' | 'refundReturnPolicy';

type LegalPageRendererProps = {
  pageKey: LegalPageKey;
  title: string;
  subtitle: string;
  fallbackContent?: React.ReactNode;
};

export default function LegalPageRenderer({
  pageKey,
  title,
  subtitle,
  fallbackContent,
}: LegalPageRendererProps) {
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchFooterSettings = async () => {
      try {
        const response = await api.get('/master/footer');
        if (!active) return;
        const html = response.data?.data?.legalPages?.[pageKey];
        if (typeof html === 'string' && html.trim().length > 10) {
          setCustomHtml(html.trim());
        }
      } catch {
        // Fallback to default content if network fails
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchFooterSettings();

    return () => {
      active = false;
    };
  }, [pageKey]);

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16 font-sans text-gray-900">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/95 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Portal Home
            </Link>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-100 p-1.5 text-amber-800">
                <FileText className="h-4 w-4" />
              </div>
              <span className="font-bold text-gray-900 text-sm sm:text-base">JCB Exchange Legal</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200/60">
            <ShieldCheck className="h-3.5 w-3.5" /> Official Policy
          </span>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="border-b border-gray-200 bg-gradient-to-b from-amber-500/10 via-white to-gray-50/60 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-2xl font-black text-gray-900 sm:text-3xl lg:text-4xl">{title}</h1>
          <p className="mt-2 text-xs font-medium text-gray-600 sm:text-sm">{subtitle}</p>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto mt-6 max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <p className="mt-3 text-xs font-semibold text-gray-500">Loading policy content...</p>
            </div>
          ) : customHtml ? (
            <div
              className="prose max-w-none text-sm leading-relaxed text-gray-700 sm:text-base prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:font-semibold prose-a:text-amber-700 prose-a:underline hover:prose-a:text-amber-800 prose-strong:text-gray-900 prose-ul:my-4 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1"
              dangerouslySetInnerHTML={{ __html: customHtml }}
            />
          ) : fallbackContent ? (
            fallbackContent
          ) : (
            <DefaultTermsFallback />
          )}
        </div>
      </main>
    </div>
  );
}

function DefaultTermsFallback() {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-700 sm:text-base">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">1. Acceptance of Terms & Platform Guidelines</h2>
        <p>
          By accessing JCB Exchange, managing vehicle listings, or updating RTO records, you agree to comply with all terms and conditions set forth herein. If you do not agree with any part of these terms, you must refrain from using the platform.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-gray-600">
          <li>All submitted vehicle and customer records must be accurate and legally verified.</li>
          <li>Authorized employees and partner dealers must maintain strict confidentiality of user data.</li>
        </ul>
      </section>

      <hr className="border-gray-100" />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">2. RTO Record Management & Accuracy</h2>
        <p>
          Users and administrative operators updating RTO Work Status records certify that all tax validity, fitness certificates, insurance details, and hire purchase agreements conform to official regional transport office standards in India.
        </p>
      </section>

      <hr className="border-gray-100" />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">3. Compliance & Legal Verification</h2>
        <p>
          Misrepresentation of machinery serial numbers, engine details, ownership documents, or fraudulent financial advances will lead to immediate record revocation and legal review under applicable Indian commerce and transport laws.
        </p>
      </section>

      <hr className="border-gray-100" />

      <section className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">4. Support & Regulatory Contact</h2>
        <div className="mt-4 space-y-2 rounded-xl border border-gray-200/80 bg-gray-50/80 p-5 text-xs text-gray-700 sm:text-sm">
          <p className="font-bold text-gray-900">JCB Exchange Official Operations</p>
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
            Plot No. 3033, Currency Tower, Raipur, Chhattisgarh, India
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-amber-600 shrink-0" />
            <a href="mailto:jcbexchange@gmail.com" className="font-semibold text-amber-700 underline hover:text-amber-800">
              jcbexchange@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
