import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Mail, MapPin } from 'lucide-react';
import LegalPageContent from '@/components/legal/LegalPageContent';

export const metadata: Metadata = {
  title: "Disclaimer | JCB Exchange - Heavy Machinery Notice",
  description: "Read the official legal disclaimer for JCB Exchange. Notices regarding equipment specifications, dealer listings, machine verification, and financial liability.",
  openGraph: {
    title: "Disclaimer | JCB Exchange",
    description: "Important legal notices and disclaimers for buyers and sellers on JCB Exchange.",
    url: "https://jcbexchange.com/disclaimer",
    siteName: "JCB Exchange",
    type: "website",
  },
  alternates: {
    canonical: "https://jcbexchange.com/disclaimer",
  },
};

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-gray-900 py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs text-gray-500">
          <Link href="/" className="hover:text-amber-600 transition-colors font-medium">Home</Link>
          <ChevronRight size={12} className="text-gray-400" />
          <span className="text-gray-900 font-semibold">Disclaimer</span>
        </nav>

        {/* Clean Unified Document Container */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-10 lg:p-12 shadow-sm space-y-8">
          <header className="border-b border-gray-100 pb-6 sm:pb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Disclaimer
            </h1>
          </header>

          {/* Document Content */}
          <LegalPageContent 
            pageKey="disclaimer" 
            fallbackHtml={
              <div className="space-y-8 text-sm sm:text-base text-gray-600 leading-relaxed">
                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    1. Marketplace Facilitation Notice
                  </h2>
                  <p>
                    JCB Exchange operates strictly as a digital marketplace connecting independent buyers, sellers, and dealers of heavy equipment. JCB Exchange does not own listed vehicles (unless explicitly specified) and is not a direct contract party to individual sale transactions.
                  </p>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    2. Listing Specifications &amp; Vehicle Condition
                  </h2>
                  <p>
                    Equipment details, engine hours, model specifications, and pricing are uploaded directly by independent sellers and dealers. While we strive to maintain high verification standards, buyers must physically inspect machinery and verify documentation prior to financial settlement.
                  </p>
                </section>

                <hr className="border-gray-100" />

                <section className="space-y-3 pt-2">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    3. Legal Questions &amp; Inquiries
                  </h2>
                  <p>
                    If you have questions regarding this Disclaimer notice, please reach out to us:
                  </p>
                  <div className="mt-4 p-5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2 text-xs sm:text-sm text-gray-700">
                    <p className="font-semibold text-gray-900">JCB Exchange Legal Support</p>
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
