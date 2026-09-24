'use client';

import Image from 'next/image';
import { useState } from 'react';
import { X } from 'lucide-react';

type ReceiptMediaProps = {
  url: string;
  alt?: string;
  mimeType?: string | null;
  className?: string;
  onClose?: () => void;
};

/** Extract a Google Drive file ID from any Drive URL variant */
const getDriveFileId = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    const hosts = new Set(['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com']);
    if (!hosts.has(parsed.hostname.toLowerCase())) return null;

    const qid = parsed.searchParams.get('id');
    if (qid && /^[a-zA-Z0-9_-]{10,}$/.test(qid)) return qid;

    const match = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    const pid = match?.[1] ?? '';
    return /^[a-zA-Z0-9_-]{10,}$/.test(pid) ? pid : null;
  } catch {
    return null;
  }
};

/** Whether the URL is our backend proxy for Drive media */
const isProxyUrl = (url: string) =>
  url.includes('/api/documents/upload/public/listing-media/drive/');

/** Build a Drive iframe embed URL */
const toDriveEmbedUrl = (fileId: string) =>
  `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

/** Detect if URL is a PDF by extension or mime */
const isPdfUrl = (url: string, mimeType?: string | null) => {
  if (mimeType) {
    const m = mimeType.trim().toLowerCase();
    if (m === 'application/pdf' || m === 'application/x-pdf') return true;
  }
  return /\.pdf$/i.test(url.split(/[?#]/)[0]);
};

export default function ReceiptMedia({
  url,
  alt = 'Payment receipt',
  mimeType,
  className = '',
  onClose,
}: ReceiptMediaProps) {
  const [imgError, setImgError] = useState(false);

  // Basic safety: must be an http(s) URL
  const isSafe = /^https?:\/\//i.test(url);

  if (!url || !isSafe) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 p-4 text-center ${className}`}>
        <p className="text-sm font-semibold text-gray-500">Receipt preview unavailable</p>
      </div>
    );
  }

  const isPdf = isPdfUrl(url, mimeType);

  // --- CASE 1: Already a backend proxy URL → render as <img> directly ---
  if (isProxyUrl(url) && !isPdf && !imgError) {
    return (
      <div className={`relative w-full h-full min-h-[300px] ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // --- CASE 2: A Google Drive URL (not yet proxied) ---
  const driveFileId = getDriveFileId(url);

  if (driveFileId && !isPdf && !imgError) {
    // Try backend proxy first
    const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, '') ?? '';
    const proxyUrl = apiBase
      ? `${apiBase}/api/documents/upload/public/listing-media/drive/${encodeURIComponent(driveFileId)}`
      : `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w2000`;

    return (
      <div className={`relative w-full h-full min-h-[300px] ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxyUrl}
          alt={alt}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // --- CASE 3: PDF or Drive PDF → use iframe embed ---
  const embedUrl = driveFileId ? toDriveEmbedUrl(driveFileId) : url;

  return (
    <div className={`relative w-full h-full min-h-[300px] ${className}`}>
      <iframe
        src={embedUrl}
        title={alt}
        className="w-full h-full border-0"
        referrerPolicy="no-referrer"
      />
      {/* Overlay close button for Drive viewer */}
      {driveFileId && onClose ? (
        <div className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-md bg-black/80 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/20"
            aria-label="Close receipt preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        {isPdf ? 'PDF receipt' : 'Receipt document'}
      </div>
    </div>
  );
}
