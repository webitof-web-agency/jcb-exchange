import React from 'react';
import { Metadata } from 'next';
import { Mail, MapPin } from 'lucide-react';
import LegalDocumentShell from '@/components/legal/LegalDocumentShell';
import LegalPageContent from '@/components/legal/LegalPageContent';

export const metadata: Metadata = {
  title: 'Refund & Return Policy | JCB Exchange - Marketplace Services',
  description: 'Read the official Refund & Return Policy of JCB Exchange for subscription charges, paid services, duplicate payments, and support-led refund handling.',
  openGraph: {
    title: 'Refund & Return Policy | JCB Exchange',
    description: 'Official refund and return guidelines for JCB Exchange digital services and platform charges.',
    url: 'https://jcbexchange.com/refund-and-return-policy',
    siteName: 'JCB Exchange',
    type: 'website',
  },
  alternates: {
    canonical: 'https://jcbexchange.com/refund-and-return-policy',
  },
};

export default function RefundAndReturnPolicyPage() {
  return (
    <LegalDocumentShell titleKey="legalPages.refundAndReturnPolicy">
      <LegalPageContent
        pageKey="refundReturnPolicy"
        fallbackHtml={
          <div className="space-y-8 text-sm sm:text-base text-gray-600 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                1. Marketplace Service Scope
              </h2>
              <p>
                JCB Exchange primarily facilitates equipment discovery, listing exposure, and buyer-seller connections.
                Unless specifically mentioned in a paid service commitment, machine sale transactions happen directly
                between independent buyers and sellers.
              </p>
            </section>

            <hr className="border-gray-100" />

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                2. Refund Eligibility
              </h2>
              <p>
                Refund requests may be reviewed for eligible digital platform charges in the following cases:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-gray-600">
                <li>A duplicate payment is charged for the same subscription or service.</li>
                <li>A verified technical issue prevents delivery of a paid platform feature and the issue remains unresolved.</li>
                <li>A refund is required under applicable law or an expressly agreed written commitment from JCB Exchange.</li>
              </ul>
            </section>

            <hr className="border-gray-100" />

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                3. Non-Refundable Situations
              </h2>
              <p>
                Refunds are generally not available for completed lead delivery, approved premium activations,
                listing promotions already consumed, or private disputes between buyer and seller after contact sharing.
              </p>
            </section>

            <hr className="border-gray-100" />

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                4. Review Timeline & Return Handling
              </h2>
              <p>
                To request a refund review, please share your registered details, payment proof, invoice or reference ID,
                and a clear issue summary with our support team. If approved, the refund is processed to the original
                payment source as per banking and gateway timelines.
              </p>
            </section>

            <hr className="border-gray-100" />

            <section className="space-y-3 pt-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                5. Support Contact
              </h2>
              <p>
                For refund and return policy queries, please contact:
              </p>
              <div className="mt-4 space-y-2 rounded-xl border border-gray-200/80 bg-gray-50 p-5 text-xs text-gray-700 sm:text-sm">
                <p className="font-semibold text-gray-900">JCB Exchange Support Team</p>
                <p className="flex items-center gap-2">
                  <MapPin size={14} className="text-amber-600" />
                  Plot No. 23, Sector 18, Gurugram, Haryana 122015, India
                </p>
                <p className="flex items-center gap-2">
                  <Mail size={14} className="text-amber-600" />
                  <a href="mailto:hello@jcbexchange.com" className="font-medium text-amber-600 hover:underline">hello@jcbexchange.com</a>
                </p>
              </div>
            </section>
          </div>
        }
      />
    </LegalDocumentShell>
  );
}
