'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { getAbsoluteMediaUrl } from '@/lib/api';
import {
  getReceiptDocumentUrl,
  getReceiptPreviewMode,
  getReceiptPreviewUrl,
  shouldMaskDriveViewerControls,
} from '@/lib/receiptPreview.mjs';

type ReceiptPreviewModalProps = {
  fileUrl: string;
  onClose: () => void;
  title?: string;
};

export default function ReceiptPreviewModal({
  fileUrl,
  onClose,
  title = 'Payment Receipt Preview',
}: ReceiptPreviewModalProps) {
  const absoluteUrl = getAbsoluteMediaUrl(fileUrl);
  const previewMode = getReceiptPreviewMode(fileUrl);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const useDocumentViewer = previewMode === 'document' || previewFailed;
  const inlinePreviewUrl = getReceiptPreviewUrl(fileUrl, absoluteUrl);
  const documentPreviewUrl = getReceiptDocumentUrl(fileUrl, absoluteUrl);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs animate-in fade-in duration-150 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-preview-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            <h3 id="receipt-preview-title" className="text-xs font-bold text-gray-900 sm:text-sm">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200/70 text-gray-600 transition hover:bg-gray-300 hover:text-gray-900"
            aria-label="Close receipt preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-[300px] flex-1 items-center justify-center overflow-auto bg-gray-900/90 p-4">
          {useDocumentViewer ? (
            <div className="relative h-[72vh] w-full">
              <iframe
                src={documentPreviewUrl}
                className="h-full w-full rounded-lg border-0 bg-white shadow-md"
                title="Payment Receipt Document Preview"
                referrerPolicy="no-referrer"
              />
              {shouldMaskDriveViewerControls(documentPreviewUrl) ? (
                <div className="absolute right-2 top-2 z-10 flex h-12 w-12 items-center justify-center rounded-md bg-black/95 shadow-lg">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/80"
                    aria-label="Close receipt preview"
                    title="Close receipt preview"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="relative h-[72vh] w-full">
              <Image
                src={inlinePreviewUrl}
                alt="Payment Receipt Document"
                fill
                unoptimized
                sizes="100vw"
                className="rounded-lg object-contain shadow-2xl ring-1 ring-white/10"
                onError={() => setPreviewFailed(true)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2.5 sm:px-5">
          <span className="text-[11px] text-gray-500">Press Esc or close to return</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
