import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Mail, MapPin } from 'lucide-react';
import LegalPageContent from '@/components/legal/LegalPageContent';

export const metadata: Metadata = {
  title: "Terms & Conditions | JCB Exchange - Heavy Machinery Marketplace",
  description: "Review the official Terms and Conditions of JCB Exchange. Guidelines for buyers, sellers, equipment listings, dealer verification, and platform usage.",
  openGraph: {
    title: "Terms & Conditions | JCB Exchange",
    description: "Official user agreement and terms of service for JCB Exchange marketplace platform.",
    url: "https://jcbexchange.com/terms-and-conditions",
    siteName: "JCB Exchange",
    type: "website",
  },
  alternates: {
    canonical: "https://jcbexchange.com/terms-and-conditions",
  },
};

export default function TermsAndConditionsPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-gray-900 py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs text-gray-500">
          <Link href="/" className="hover:text-amber-600 transition-colors font-medium">Home</Link>
          <ChevronRight size={12} className="text-gray-400" />
          <span className="text-gray-900 font-semibold">Terms &amp; Conditions</span>
        </nav>

        {/* Clean Unified Document Container */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-10 lg:p-12 shadow-sm space-y-8">
          <header className="border-b border-gray-100 pb-6 sm:pb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Terms &amp; Conditions
            </h1>
          </header>

          {/* Document Content */}
          <LegalPageContent 
            pageKey="termsConditions" 
            fallbackHtml={
              <div className="space-y-8 text-sm sm:text-base text-gray-600 leading-relaxed">
                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    1. Platform Scope &amp; Eligibility
                  </h2>
                  <p>
                    JCB Exchange is an online marketplace dedicated to facilitating equipment discovery and transaction inquiries for pre-owned and new JCB machinery, excavators, backhoe loaders, and heavy construction equipment across India.
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-600">
                    <li>Users must be at least 18 years old or an authorized business entity.</li>
                    <li>Users must maintain valid contact credentials and keep login details secure.</li>
                  </ul>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    2. Listing Guidelines for Sellers &amp; Dealers
                  </h2>
                  <p>
                    Sellers and verified partner dealers uploading machinery listings agree to the following obligations:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-gray-600">
                    <li>All specifications (year, operating hours, model variant, price) must be factual and non-misleading.</li>
                    <li>Sellers must possess valid legal ownership or written authorization to sell the listed equipment.</li>
                    <li>Misrepresentation, fake pricing, or fraudulent serial numbers will result in immediate listing removal and account ban.</li>
                  </ul>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    3. Buyer Due Diligence &amp; Inspection
                  </h2>
                  <p>
                    While JCB Exchange conducts dealer verification checks, prospective buyers are strongly advised to perform independent physical inspections, mechanical evaluations, and ownership document checks before making financial transfers.
                  </p>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    4. Governing Law &amp; Jurisdiction
                  </h2>
                  <p>
                    These terms are governed by the laws of India. Any legal disputes arising out of platform usage shall be subject to the exclusive jurisdiction of the courts in Gurugram, Haryana.
                  </p>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3 pt-2">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    5. Questions &amp; Support
                  </h2>
                  <p>
                    For questions regarding these Terms &amp; Conditions, please contact us:
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
        </div>
      </div>
    </main>
  );
}
