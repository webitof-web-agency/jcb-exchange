'use client';

import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

type MediaDownloadButtonProps = {
  url: string;
  fileName: string;
  label?: string;
  className?: string;
  iconClassName?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export const getMediaDownloadFileName = (title: string, type: string, index: number, url?: string | null) => {
  const safeTitle = title.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jcb-exchange-media';
  const normalizedUrl = String(url || '').split('?')[0].toLowerCase();
  const urlExtension = normalizedUrl.match(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/)?.[1];
  const extension = urlExtension || (type === 'VIDEO' ? 'mp4' : 'jpg');
  return `${safeTitle}-${type.toLowerCase()}-${index + 1}.${extension}`;
};

const triggerDirectDownload = (url: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadMediaFile = async (url: string, fileName: string) => {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`Media download failed with status ${response.status}.`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      triggerDirectDownload(objectUrl, fileName);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  } catch {
    // If a remote host disallows blob fetching, open the original media URL
    // so mobile users can still use the browser's native save/download menu.
    triggerDirectDownload(url, fileName);
  }
};

export default function MediaDownloadButton({
  url,
  fileName,
  label = 'Download media',
  className = '',
  iconClassName = 'h-4 w-4',
  onClick,
}: MediaDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.(event);

    if (downloading || !url) return;

    setDownloading(true);
    try {
      await downloadMediaFile(url, fileName);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(event) => void handleClick(event)}
      disabled={downloading || !url}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {downloading ? <LoaderCircle className={`${iconClassName} animate-spin`} aria-hidden="true" /> : <Download className={iconClassName} aria-hidden="true" />}
    </button>
  );
}
