'use client';

import { useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';

/**
 * Offers are answered on the public website (/offer-response/[token] there: details, signature, certificate).
 * Links sent earlier may still point at this admin host, so this page only forwards the candidate.
 */
const publicSiteOrigin = () => (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || 'https://jcbexchange.com').replace(/\/+$/, '');

export default function OfferResponseRedirectPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const target = useMemo(() => {
    if (!token) return '';
    let raw = token;
    try {
      raw = decodeURIComponent(token);
    } catch {
      // A malformed % sequence: forward the token as it is.
    }
    return `${publicSiteOrigin()}/offer-response/${encodeURIComponent(raw)}`;
  }, [token]);

  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Opening your offer…</h1>
        <p className="mt-2 text-sm text-slate-600">If nothing happens, open it here:</p>
        {target ? (
          <a href={target} rel="noreferrer" className="mt-3 inline-block break-all text-sm font-semibold text-amber-700 underline">Open your offer letter</a>
        ) : (
          <p className="mt-3 text-sm text-red-600">This offer link is incomplete. Please use the full link from your email, WhatsApp or SMS.</p>
        )}
      </div>
    </main>
  );
}
