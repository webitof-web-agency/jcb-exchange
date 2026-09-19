"use client";

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastItem } from '@/store/toastStore';

const toastStyles: Record<ToastItem['variant'], string> = {
  success: 'border-emerald-200 bg-white text-emerald-900 shadow-emerald-950/10',
  error: 'border-red-200 bg-white text-red-900 shadow-red-950/10',
  info: 'border-amber-200 bg-white text-amber-950 shadow-amber-950/10',
};

const toastIcons: Record<ToastItem['variant'], typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export default function ToastViewport() {
  const { toasts, dismissToast } = useToastStore();

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[999999] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2.5 transition-all">
      {toasts.map((toast) => {
        const Icon = toastIcons[toast.variant];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xs animate-in fade-in slide-in-from-top-4 duration-200 ${toastStyles[toast.variant]}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <Icon
                  className={`h-5 w-5 ${
                    toast.variant === 'success'
                      ? 'text-emerald-600'
                      : toast.variant === 'error'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs font-medium text-gray-600 leading-snug">{toast.description}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
