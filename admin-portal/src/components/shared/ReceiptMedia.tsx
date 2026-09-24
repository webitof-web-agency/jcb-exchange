'use client';

import Image from 'next/image';
import { useState } from 'react';
import { X } from 'lucide-react';
import {
  getReceiptDocumentUrl,
  getReceiptMediaType,
  getReceiptThumbnailUrl,
  isSafeReceiptUrl,
  shouldMaskDriveViewerControls,
} from '@/lib/receiptMedia.mjs';

type ReceiptMediaProps = {
  url: string;
  alt?: string;
  mimeType?: string | null;
  className?: string;
  onClose?: () => void;
};

export default function ReceiptMedia({
  url,
  alt = 'Payment receipt',
  mimeType,
  className = '',
  onClose,
}: ReceiptMediaProps) {
  const [hasError, setHasError] = useState(false);
  const [useDocumentFrame, setUseDocumentFrame] = useState(false);
  const isSafeUrl = isSafeReceiptUrl(url);
  const mediaType = getReceiptMediaType(url, mimeType);
  const thumbnailUrl = getReceiptThumbnailUrl(url);
  const canUseInlineImage = mediaType === 'image' || Boolean(thumbnailUrl);

  if (!isSafeUrl || hasError) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 p-4 text-center ${className}`}>
        <p className="text-xs font-semibold text-gray-600">Receipt preview unavailable</p>
        {isSafeUrl ? (
          <a
            href={url}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Open original receipt
          </a>
        ) : null}
      </div>
    );
  }

  if (canUseInlineImage && !useDocumentFrame) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        <Image
          src={thumbnailUrl || url}
          alt={alt}
          fill
          unoptimized
          sizes="100vw"
          className="object-contain"
          onError={() => {
            if (thumbnailUrl) {
              setUseDocumentFrame(true);
            } else {
              setHasError(true);
            }
          }}
        />
      </div>
    );
  }

  const documentUrl = getReceiptDocumentUrl(url);
  const maskDriveViewerControls = shouldMaskDriveViewerControls(documentUrl);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <iframe
        src={documentUrl}
        title={alt}
        className="h-full w-full border-0"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
      {maskDriveViewerControls ? (
        <div className="absolute right-2 top-2 z-10 flex h-12 w-12 items-center justify-center rounded-md bg-black/95 shadow-lg">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/80"
              aria-label="Close receipt preview"
              title="Close receipt preview"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        {mediaType === 'pdf' ? 'PDF receipt' : 'Receipt document'}
      </div>
    </div>
  );
}
