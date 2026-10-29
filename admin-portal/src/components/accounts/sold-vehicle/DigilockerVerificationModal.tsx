'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import api from '@/lib/api';

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

// Pinned with a Subresource Integrity hash: the browser refuses the file if its content ever changes.
// To upgrade, change the version and replace the hash with the new file's sha384.
const SDK_SRC = 'https://cdn.jsdelivr.net/gh/surepassio/surepass-digiboost-web-sdk@1.1.8/index.min.js';
const SDK_INTEGRITY = 'sha384-9I0RgD1w33B4urxSPbfBC4LjjxvgAA38/Y2cMEL8AL6HvOUiuoCUAIzlqzBSYjBM';

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

type VerificationPhase = 'ready' | 'verifying' | 'success';

export function DigilockerVerificationModal({
  session,
  onSuccess,
  onClose,
  statusEndpointBase = '/aadhaar-verification',
}: {
  session: DigilockerVerificationSession;
  onSuccess: (clientId: string) => void;
  onClose: () => void;
  statusEndpointBase?: string;
}) {
  const [sdkReady, setSdkReady] = useState(Boolean(typeof window !== 'undefined' && window.DigiboostSdk));
  const [sdkError, setSdkError] = useState('');
  const [phase, setPhase] = useState<VerificationPhase>('ready');
  const [manualChecking, setManualChecking] = useState(false);
  const initialized = useRef(false);
  const completedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectorId = `digilocker-gateway-${session.recordId}`;

  const handleSuccessTrigger = useCallback((clientId: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPhase('success');
    setTimeout(() => {
      onSuccess(clientId || session.clientId);
    }, 600);
  }, [onSuccess, session.clientId]);

  const checkRemoteStatus = useCallback(async () => {
    if (completedRef.current) return;
    try {
      const response = await api.get<{
        success: boolean;
        ready?: boolean;
        status?: string;
        record?: { providerClientId?: string | null };
      }>(`${statusEndpointBase}/status/${session.recordId}`);

      if (response.data?.ready || response.data?.status === 'SUCCESS') {
        const remoteClientId = response.data.record?.providerClientId?.trim() || session.clientId;
        handleSuccessTrigger(remoteClientId);
      }
    } catch {
      // Ignore background poll errors while transaction is in-flight
    }
  }, [handleSuccessTrigger, session.clientId, session.recordId, statusEndpointBase]);

  useEffect(() => {
    if (window.DigiboostSdk) return;
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
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';
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
          if (clientId) handleSuccessTrigger(clientId);
          else setSdkError('DigiLocker completed but no verification session was returned.');
        },
        onFailure: (error) => {
          void checkRemoteStatus();
          setSdkError(errorText(error));
        },
        style: {
          buttonColor: '#FFC107',
          buttonTextColor: '#0f172a',
          borderRadius: '10px',
        },
      });
    } catch {
      queueMicrotask(() => setSdkError('DigiLocker verification could not be started.'));
    }
  }, [checkRemoteStatus, handleSuccessTrigger, sdkReady, selectorId, session.clientId, session.gateway, session.sdkToken]);

  // Transition to verifying phase when user clicks into the Digiboost selector
  useEffect(() => {
    const el = document.getElementById(selectorId);
    if (!el) return;
    const handleClick = () => {
      setPhase('verifying');
      setSdkError('');
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [selectorId, sdkReady]);

  // Background polling and window focus sync while verifying
  useEffect(() => {
    if (phase !== 'verifying' || completedRef.current) return;

    pollTimerRef.current = setInterval(() => {
      void checkRemoteStatus();
    }, 2500);

    const handleFocus = () => {
      void checkRemoteStatus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [checkRemoteStatus, phase]);

  const handleManualCheck = async () => {
    setManualChecking(true);
    try {
      await checkRemoteStatus();
    } finally {
      setManualChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Verify Aadhaar with DigiLocker
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Complete the official DigiLocker consent flow. Your Aadhaar number is not sent to the browser SDK.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close DigiLocker verification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {phase === 'success' ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-bounce">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900">DigiLocker Verification Successful!</h3>
              <p className="mt-1 text-xs text-slate-500">Retrieving official Aadhaar details and loading your template preview...</p>
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading template...
              </div>
            </div>
          ) : phase === 'verifying' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-xs text-blue-900">
                <div className="flex items-center gap-2 font-bold text-blue-900">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  DigiLocker Consent Window Open
                </div>
                <p className="mt-1.5 pl-6 text-blue-800 leading-relaxed">
                  Please complete the OTP verification in the DigiLocker popup window. This screen will automatically update and load your verified card once complete.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span>Waiting for DigiLocker approval...</span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleManualCheck()}
                  disabled={manualChecking}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${manualChecking ? 'animate-spin' : ''}`} />
                  {manualChecking ? 'Checking...' : 'Check Status Now'}
                </button>
              </div>

              <div id={selectorId} className="hidden" />

              {sdkError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800">
                  {sdkError}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Secure provider session ready
                </div>
                <p className="mt-1 pl-6 text-amber-800">
                  Click the button below to open the official DigiLocker window and allow document sharing after OTP consent.
                </p>
              </div>

              <div
                id={selectorId}
                className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                {!sdkReady && !sdkError ? (
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading DigiLocker…
                  </span>
                ) : null}
                {sdkError ? (
                  <span className="text-center text-xs font-semibold text-rose-600">{sdkError}</span>
                ) : null}
              </div>
            </>
          )}

          <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <ExternalLink className="h-3 w-3" />
            Official DigiLocker consent is securely handled by Surepass.
          </p>
        </div>
      </div>
    </div>
  );
}
