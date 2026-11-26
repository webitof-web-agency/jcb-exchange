'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { findSignatureFields, type SignatureFields, type TextPage } from '@/lib/offerLetterFields.mjs';

export type LetterPage = { width: number; height: number; src: string };
export type LetterView =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; pages: LetterPage[]; fields: SignatureFields | null };

const MAX_PAGES = 20;
const RENDER_WIDTH = 1400;
const TIMEOUT_MS = 45_000;

/**
 * Draws an offer letter PDF page by page (pdf.js), so it can be read on phones too, and finds its signature line.
 * 'failed' (an old browser, a damaged file) leaves the Open / Download buttons as the way to read it.
 */
export function useLetterPages(path: string | null): LetterView {
  const [result, setResult] = useState<{ path: string; view: LetterView } | null>(null);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    const urls: string[] = [];
    const timer = window.setTimeout(() => {
      if (!cancelled) setResult((current) => (current?.path === path && current.view.status === 'ready' ? current : { path, view: { status: 'failed' } }));
    }, TIMEOUT_MS);

    const draw = async () => {
      const response = await api.get<ArrayBuffer>(path, { responseType: 'arraybuffer', timeout: TIMEOUT_MS });
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      // A signed copy may be a PDF the candidate uploaded: never evaluate code from a document.
      const task = pdfjs.getDocument({ data: new Uint8Array(response.data), isEvalSupported: false });
      try {
        const document_ = await task.promise;
        const pages: LetterPage[] = [];
        const text: TextPage[] = [];
        for (let number = 1; number <= Math.min(document_.numPages, MAX_PAGES); number += 1) {
          if (cancelled) return;
          const page = await document_.getPage(number);
          const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
          const content = await page.getTextContent();
          text.push({
            width: right - left,
            height: top - bottom,
            runs: content.items.flatMap((item) => ('str' in item && item.str
              ? [{ text: item.str, x: Number(item.transform[4]) - left, y: Number(item.transform[5]) - bottom, width: item.width, size: Math.hypot(Number(item.transform[2]), Number(item.transform[3])) || item.height }]
              : [])),
          });
          const viewport = page.getViewport({ scale: Math.min(2.5, RENDER_WIDTH / (right - left || 595)) });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is not available.');
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The page could not be drawn.'))), 'image/png'));
          // Left meanwhile: the cleanup has already run, so no new picture is kept.
          if (cancelled) return;
          const src = URL.createObjectURL(image);
          urls.push(src);
          pages.push({ width: right - left, height: top - bottom, src });
          canvas.width = 0;
          canvas.height = 0;
        }
        if (!cancelled) setResult({ path, view: { status: 'ready', pages, fields: findSignatureFields(text) } });
      } finally {
        await task.destroy().catch(() => undefined);
      }
    };

    draw()
      .catch((error: unknown) => {
        console.warn('The offer letter preview could not be drawn.', error);
        if (!cancelled) setResult({ path, view: { status: 'failed' } });
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [path]);

  if (!path) return { status: 'failed' };
  return result?.path === path ? result.view : { status: 'loading' };
}
