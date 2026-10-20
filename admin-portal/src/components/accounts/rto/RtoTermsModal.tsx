'use client';

import { useEffect, useState } from 'react';
import { Check, FileText, Loader2, Mail, MapPin, X } from 'lucide-react';
import api from '@/lib/api';

// ─── Terms & Conditions Modal ────────────────────────────────────────────────
// Dynamically fetches content from /master/footer API (legalPages.termsConditions)
// Same source as the frontend /terms-and-conditions page (LegalPageContent).
// Falls back to a platform-specific default when nothing has been configured yet.

export default function RtoTermsModal({ onClose }: { onClose: () => void }) {
  const [customHtml, setCustomHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      try {
        const response = await api.get('/master/footer');
        if (!active) return;
        const html = response.data?.data?.legalPages?.termsConditions;
        if (typeof html === 'string' && html.trim().length > 10) {
          setCustomHtml(html.trim());
        }
      } catch {
        // Network error — show fallback below
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchContent();
    return () => { active = false; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Dark Header matching sidebar ── */}
        <div className="relative shrink-0 overflow-hidden bg-[#1A1A1A] px-6 pb-5 pt-5">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#FFC107]/15 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#FFC107]/40 to-transparent" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/10 ring-1 ring-[#FFC107]/30">
                <FileText className="h-5 w-5 text-[#FFC107]" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight text-white">Terms &amp; Conditions</h2>
                <p className="mt-0.5 text-xs font-medium text-gray-400">JCB Exchange — Official Platform Agreement</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Terms and Conditions"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gray-300 transition hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#FFC107]/10">
                <Loader2 className="h-6 w-6 animate-spin text-[#FFC107]" />
              </div>
              <p className="mt-4 text-xs font-semibold text-gray-400">Loading Terms &amp; Conditions…</p>
            </div>
          ) : customHtml ? (
            <div className="px-6 py-6">
              <div
                className="prose max-w-none text-sm leading-relaxed text-gray-700 prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:font-semibold prose-a:text-amber-700 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-ul:my-3 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1 prose-li:text-gray-600 prose-hr:border-gray-200"
                dangerouslySetInnerHTML={{ __html: customHtml }}
              />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="flex gap-4 px-6 py-5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFC107]/15 text-xs font-black text-amber-700">1</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-900">Acceptance of Terms &amp; Platform Guidelines</h3>
                  <p className="text-xs leading-relaxed text-gray-600">By accessing JCB Exchange, managing vehicle listings, or updating RTO records, you agree to comply with all terms and conditions set forth herein.</p>
                  <ul className="space-y-1.5">
                    <li className="flex items-start gap-2 text-xs text-gray-600"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFC107]" />All submitted vehicle and customer records must be accurate and legally verified.</li>
                    <li className="flex items-start gap-2 text-xs text-gray-600"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFC107]" />Authorized employees and partner dealers must maintain strict confidentiality of user data.</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-4 px-6 py-5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFC107]/15 text-xs font-black text-amber-700">2</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-900">RTO Record Management &amp; Accuracy</h3>
                  <p className="text-xs leading-relaxed text-gray-600">Users and administrative operators updating RTO Work records certify that all tax validity, fitness certificates, insurance details, and hire purchase agreements conform to official regional transport office standards in India.</p>
                </div>
              </div>
              <div className="flex gap-4 px-6 py-5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFC107]/15 text-xs font-black text-amber-700">3</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-900">Compliance &amp; Legal Verification</h3>
                  <p className="text-xs leading-relaxed text-gray-600">Misrepresentation of machinery serial numbers, engine details, ownership documents, or fraudulent financial advances will lead to immediate record revocation and legal review under applicable Indian commerce and transport laws.</p>
                </div>
              </div>
              <div className="flex gap-4 px-6 py-5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFC107]/15 text-xs font-black text-amber-700">4</div>
                <div className="w-full space-y-3">
                  <h3 className="text-sm font-bold text-gray-900">Support &amp; Regulatory Contact</h3>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p className="mb-2.5 text-xs font-bold text-gray-900">JCB Exchange Official Operations</p>
                    <p className="flex items-start gap-2 text-xs text-gray-600 mb-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFC107]" />
                      Plot No. 3033, Currency Tower, Raipur, Chhattisgarh, India
                    </p>
                    <p className="flex items-center gap-2 text-xs">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-[#FFC107]" />
                      <a href="mailto:jcbexchange@gmail.com" className="font-semibold text-amber-700 hover:underline">jcbexchange@gmail.com</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">By closing, you acknowledge reading the terms.</p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-6 py-2.5 text-sm font-bold text-[#1A1A1A] shadow-sm transition hover:bg-[#E5AD06] active:scale-[0.98]"
            >
              <Check className="h-4 w-4" />
              I Understand
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
