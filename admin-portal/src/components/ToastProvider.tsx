'use client';

import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastContainer } from 'react-toastify';

interface ToastProviderProps {
  children: React.ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps) {
  return (
    <>
      {children}
      <ToastContainer
        position="top-right"
        autoClose={3500}
        newestOnTop
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
        icon={({ type }) => {
          switch (type) {
            case 'success':
              return (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 border border-emerald-200 shadow-xs">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              );
            case 'error':
              return (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 border border-rose-200 shadow-xs">
                  <AlertCircle className="h-5 w-5" />
                </span>
              );
            case 'warning':
              return (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200 shadow-xs">
                  <AlertTriangle className="h-5 w-5" />
                </span>
              );
            case 'info':
            default:
              return (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 border border-sky-200 shadow-xs">
                  <Info className="h-5 w-5" />
                </span>
              );
          }
        }}
        closeButton={({ closeToast }) => (
          <button
            type="button"
            onClick={closeToast}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      />
    </>
  );
}
