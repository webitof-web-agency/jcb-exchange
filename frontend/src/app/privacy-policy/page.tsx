import React from 'react';
import { Metadata } from 'next';
import { Mail, MapPin } from 'lucide-react';
import LegalDocumentShell from '@/components/legal/LegalDocumentShell';
import LegalPageContent from '@/components/legal/LegalPageContent';

export const metadata: Metadata = {
  title: "Privacy Policy | JCB Exchange - Heavy Equipment Marketplace",
  description: "Read the official Privacy Policy of JCB Exchange. Learn how we collect, protect, and use your personal information, contact details, and heavy machinery listing data.",
  openGraph: {
    title: "Privacy Policy | JCB Exchange",
    description: "Learn how JCB Exchange protects user privacy, personal data, and equipment listing information.",
    url: "https://jcbexchange.com/privacy-policy",
    siteName: "JCB Exchange",
    type: "website",
  },
  alternates: {
    canonical: "https://jcbexchange.com/privacy-policy",
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentShell titleKey="legalPages.privacyPolicy">
          <LegalPageContent 
            pageKey="privacyPolicy" 
            fallbackHtml={
              <div className="space-y-8 text-sm sm:text-base text-gray-600 leading-relaxed">
                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    1. Information We Collect
                  </h2>
                  <p>
                    When you register, submit buyer inquiries, or list heavy machinery on our platform, we collect information necessary to facilitate authentic transactions:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-600">
                    <li>
                      <strong className="text-gray-900 font-medium">Account &amp; Contact Details:</strong> Full name, mobile number, WhatsApp number, email address, business location, and city.
                    </li>
                    <li>
                      <strong className="text-gray-900 font-medium">Equipment Data:</strong> Machine model numbers, manufacture year, operating hours, photos, pricing, and ownership documents uploaded by sellers.
                    </li>
                    <li>
                      <strong className="text-gray-900 font-medium">Technical Usage Data:</strong> IP address, device specifications, browser type, and page visit metrics collected via cookies to optimize user experience.
                    </li>
                  </ul>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    2. How We Use Your Information
                  </h2>
                  <p>
                    We use the collected information for the following specific marketplace operations:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-600">
                    <li>Connecting prospective machine buyers directly with verified equipment sellers and dealers.</li>
                    <li>Verifying seller identity and machinery details to maintain marketplace trust and prevent fraud.</li>
                    <li>Sending SMS/WhatsApp alerts for inquiry status, listing approvals, and Prime membership updates.</li>
                    <li>Ensuring network security, system monitoring, and compliance with statutory Indian laws.</li>
                  </ul>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    3. Information Sharing &amp; Disclosure
                  </h2>
                  <p>
                    We respect your personal data and do not sell or rent user contact lists to external marketing agencies. Data is shared exclusively under the following terms:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-600">
                    <li>
                      <strong className="text-gray-900 font-medium">Dealer-Buyer Inquiries:</strong> Contact details are shared with verified sellers when a buyer explicitly submits a lead or callback request for a listed vehicle.
                    </li>
                    <li>
                      <strong className="text-gray-900 font-medium">Authorized Infrastructure Partners:</strong> Cloud hosting, payment gateway providers, and SMS gateways operating under strict confidentiality obligations.
                    </li>
                    <li>
                      <strong className="text-gray-900 font-medium">Legal Compliance:</strong> Disclosure to government or legal authorities if required under applicable Indian laws or judicial orders.
                    </li>
                  </ul>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    4. Data Security &amp; Storage
                  </h2>
                  <p>
                    We implement industry-standard SSL encryption, secure API endpoints, and access-controlled servers to protect user data against unauthorized access, loss, or alteration.
                  </p>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3 pt-2">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    5. Contact &amp; Privacy Officer
                  </h2>
                  <p>
                    If you have questions, wish to access your personal data, or request account deletion, please contact our support team:
                  </p>
                  <div className="mt-4 p-5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2 text-xs sm:text-sm text-gray-700">
                    <p className="font-semibold text-gray-900">JCB Exchange Support Team</p>
                    <p className="flex items-center gap-2">
                      <MapPin size={14} className="text-amber-600" />
                      Plot No. 23, Sector 18, Gurugram, Haryana 122015, India
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail size={14} className="text-amber-600" />
                      <a href="mailto:hello@jcbexchange.com" className="text-amber-600 hover:underline font-medium">hello@jcbexchange.com</a>
                    </p>
                  </div>
                </section>
              </div>
            } 
          />
    </LegalDocumentShell>
  );
}
