'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

type State =
  | { kind: 'LOADING' }
  | { kind: 'CLOSED' | 'NOT_FOUND' | 'UNAVAILABLE'; message: string };

const UNAVAILABLE = 'The offer service is not available right now. Please try again shortly.';

/**
 * Looks the short code up from the candidate's own browser (so the per-network limit on code lookups applies to each
 * candidate, not to this web server) and replaces the page with the offer page. Only a path on this site is followed.
 */
export default function OfferShortLinkClient({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: 'LOADING' });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/+$/, '')}/recruitment/public/offer-links/${encodeURIComponent(code)}`, {
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { path?: unknown; error?: unknown };
        if (cancelled) return;
        if (response.ok && typeof body.path === 'string' && body.path.startsWith('/offer-response/')) {
          window.location.replace(body.path);
          return;
        }
        const message = typeof body.error === 'string' ? body.error : '';
        if (response.status === 410) setState({ kind: 'CLOSED', message: message || 'This offer link has been replaced by a newer one.' });
        else if (response.status === 404) setState({ kind: 'NOT_FOUND', message: message || 'This offer link is not valid.' });
        else if (response.status === 429) setState({ kind: 'UNAVAILABLE', message: message || 'Too many attempts. Please try again in a few minutes.' });
        else setState({ kind: 'UNAVAILABLE', message: UNAVAILABLE });
      } catch {
        if (!cancelled) setState({ kind: 'UNAVAILABLE', message: UNAVAILABLE });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [code]);

  if (state.kind === 'LOADING') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm text-slate-600">Opening your offer letter…</p>
      </main>
    );
  }

  const title = state.kind === 'CLOSED' ? 'This link is no longer active' : state.kind === 'NOT_FOUND' ? 'Link not found' : 'Please try again';
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{state.message}</p>
        {state.kind === 'CLOSED' ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            JCB Exchange sends a new link whenever an offer is sent again. Please open the most recent email, SMS or WhatsApp message, or contact our HR team.
          </p>
        ) : null}
        <Link href="/" className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Go to JCB Exchange
        </Link>
      </div>
    </main>
  );
}
