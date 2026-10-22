import type { Metadata } from 'next';
import LeadCaptureForm from '@/components/crm/LeadCaptureForm';

export const metadata: Metadata = {
  title: 'Sell Your Machine — Get a Quick Offer',
  description: 'Want to sell your JCB or construction machine fast? Share the details and JCB Exchange will call you with an offer.',
  alternates: { canonical: '/sell-machine' },
  openGraph: {
    title: 'Sell Your Machine | JCB Exchange',
    description: 'Share your machine details and get a call back with an offer.',
    url: 'https://jcbexchange.com/sell-machine',
    type: 'website',
  },
};

export default function SellMachinePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C99A1E]">Quick offer</p>
        <h1 className="mt-2 text-3xl font-black text-gray-900 sm:text-4xl">Sell your machine</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">Share a few details about your machine. Our team calls you, checks the papers and makes an offer — no listing needed.</p>
        <div className="mt-8"><LeadCaptureForm mode="SELL" /></div>
      </div>
    </main>
  );
}
