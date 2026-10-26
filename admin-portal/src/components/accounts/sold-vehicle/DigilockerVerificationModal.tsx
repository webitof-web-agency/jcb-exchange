'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';

declare global {
  interface Window {
    DigiboostSdk?: (options: {
      gateway: 'sandbox' | 'production';
      token: string;
      selector: string;
      onSuccess?: (response: unknown) => void;
      onFailure?: (error: unknown) => void;
      style?: Record<string, string>;
    }) => unknown;
  }
}

const SDK_SRC = 'https://cdn.jsdelivr.net/gh/surepassio/surepass-digiboost-web-sdk@latest/index.min.js';

const findClientId = (value: unknown): string => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const source = value as Record<string, unknown>;
  for (const key of ['client_id', 'clientId']) {
    if (typeof source[key] === 'string' && source[key].trim()) return source[key].trim();
  }
  for (const child of Object.values(source)) {
    const found = findClientId(child);
    if (found) return found;
  }
  return '';
};

const errorText = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'error_message']) {
      if (typeof source[key] === 'string' && source[key].trim()) return source[key].trim();
    }
  }
  return 'DigiLocker verification was not completed.';
};

export type DigilockerVerificationSession = {
  recordId: string;
  clientId: string;
  sdkToken: string;
  gateway: 'sandbox' | 'production';
  expirySeconds?: number;
};

export function DigilockerVerificationModal({
  session,
  onSuccess,
  onClose,
}: {
  session: DigilockerVerificationSession;
  onSuccess: (clientId: string) => void;
  onClose: () => void;
}) {
  const [sdkReady, setSdkReady] = useState(Boolean(typeof window !== 'undefined' && window.DigiboostSdk));
  const [sdkError, setSdkError] = useState('');
  const initialized = useRef(false);
  const selectorId = `digilocker-gateway-${session.recordId}`;

  useEffect(() => {
    if (window.DigiboostSdk) {
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      const onLoad = () => setSdkReady(Boolean(window.DigiboostSdk));
      const onError = () => setSdkError('DigiLocker verification service could not be loaded.');
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
      };
    }
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => setSdkReady(Boolean(window.DigiboostSdk));
    script.onerror = () => setSdkError('DigiLocker verification service could not be loaded.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!sdkReady || initialized.current || !window.DigiboostSdk) return;
    initialized.current = true;
    try {
      window.DigiboostSdk({
        gateway: session.gateway,
        token: session.sdkToken,
        selector: `#${selectorId}`,
        onSuccess: (response) => {
          const clientId = findClientId(response) || session.clientId;
          if (clientId) onSuccess(clientId);
          else setSdkError('DigiLocker completed but no verification session was returned.');
        },
        onFailure: (error) => setSdkError(errorText(error)),
        style: {
          buttonColor: '#FFC107',
          buttonTextColor: '#0f172a',
          borderRadius: '10px',
        },
      });
    } catch {
      queueMicrotask(() => setSdkError('DigiLocker verification could not be started.'));
    }
  }, [onSuccess, sdkReady, selectorId, session.clientId, session.gateway, session.sdkToken]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Verify Aadhaar with DigiLocker</div>
            <p className="mt-1 text-xs text-slate-500">Complete the official DigiLocker consent flow. Your Aadhaar number is not sent to the browser SDK.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close DigiLocker verification"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Secure provider session ready</div>
            <p className="mt-1 pl-6 text-amber-800">Use the DigiLocker window below and allow document sharing after OTP consent.</p>
          </div>
          <div id={selectorId} className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3">
            {!sdkReady && !sdkError ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading DigiLocker…</span> : null}
            {sdkError ? <span className="text-center text-xs font-semibold text-rose-600">{sdkError}</span> : null}
          </div>
          <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500"><ExternalLink className="h-3 w-3" />Official DigiLocker consent is handled by Surepass.</p>
        </div>
      </div>
    </div>
  );
}
