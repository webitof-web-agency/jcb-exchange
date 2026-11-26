'use client';

import React from 'react';
import type { SignatureFields } from '@/lib/offerLetterFields.mjs';
import type { LetterPage } from './useLetterPages';

/** What is written on the signature line while the candidate signs (a preview of the signed letter). */
export type SignatureOverlay = { image: string | null; date: string; place: string };

const percent = (value: number, total: number) => `${(value / total) * 100}%`;

/** The signature, date and place placed on a page exactly where the server writes them. */
function SignatureOnPage({ fields, overlay }: { fields: SignatureFields; overlay: SignatureOverlay }) {
  const { pageWidth, pageHeight, signature, date, place } = fields;
  // Text drawn at 10 pt on the PDF, scaled with the page as shown.
  const fontSize = `${(10 / pageWidth) * 100}cqw`;
  const textAt = (point: { x: number; y: number }): React.CSSProperties => ({ left: percent(point.x, pageWidth), bottom: percent(point.y - 2.2, pageHeight), fontSize, fontFamily: 'Helvetica, Arial, sans-serif' });
  return (
    <>
      <div className="absolute" style={{ left: percent(signature.x, pageWidth), bottom: percent(signature.y, pageHeight), width: percent(signature.width, pageWidth), height: percent(signature.height, pageHeight) }}>
        {overlay.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on this device
          <img src={overlay.image} alt="Your signature" className="h-full w-full object-contain object-left-bottom" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-amber-500 bg-amber-200/50 font-bold text-amber-900" style={{ fontSize: `${(8 / pageWidth) * 100}cqw` }}>Your signature</span>
        )}
      </div>
      {date && overlay.image ? <span className="absolute whitespace-nowrap leading-none text-slate-900" style={textAt(date)}>{overlay.date}</span> : null}
      {place && overlay.image && overlay.place ? <span className="absolute whitespace-nowrap leading-none text-slate-900" style={textAt(place)}>{overlay.place}</span> : null}
    </>
  );
}

function PageImage({ page, number }: { page: LetterPage; number: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a page of the letter drawn on this device
  return <img src={page.src} alt={`Offer letter, page ${number}`} className="block h-auto w-full" width={Math.round(page.width)} height={Math.round(page.height)} />;
}

/** All pages of the letter; the signature preview sits on the page with the signature line. */
export default function LetterPages({ pages, fields, overlay }: { pages: LetterPage[]; fields: SignatureFields | null; overlay: SignatureOverlay | null }) {
  return (
    <div className="space-y-3">
      {pages.map((page, index) => (
        <div key={page.src} className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" style={{ containerType: 'inline-size' }}>
          <PageImage page={page} number={index + 1} />
          {overlay && fields && fields.page === index ? <SignatureOnPage fields={fields} overlay={overlay} /> : null}
        </div>
      ))}
    </div>
  );
}

/** A close-up of the acceptance lines, shown right where the candidate signs. */
export function SignatureCloseUp({ pages, fields, overlay }: { pages: LetterPage[]; fields: SignatureFields; overlay: SignatureOverlay }) {
  const page = pages[fields.page];
  if (!page) return null;
  const { pageWidth, pageHeight, signature } = fields;
  // The signature line with the name above it and the date / place below, not the paragraph over them.
  const left = Math.max(0, Math.min(36, signature.x - 60));
  const right = Math.min(pageWidth, Math.max(signature.x + signature.width + 24, left + 300));
  const above = fields.lineAbove === null ? 0 : fields.lineAbove + 12;
  const top = Math.min(pageHeight, Math.max(above, signature.y + signature.height + 4));
  const bottom = Math.max(0, signature.y - 36);
  const width = right - left;
  const height = top - bottom;
  // The whole page, scaled so the block fills the box, then moved by fractions of its own size (exact at any width).
  const shift = `translate(${-(left / pageWidth) * 100}%, ${-((pageHeight - top) / pageHeight) * 100}%)`;
  return (
    <div className="overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${width} / ${height}` }}>
        <div className="absolute left-0 top-0" style={{ width: percent(pageWidth, width), transform: shift, containerType: 'inline-size' }}>
          <PageImage page={page} number={fields.page + 1} />
          <SignatureOnPage fields={fields} overlay={overlay} />
        </div>
      </div>
    </div>
  );
}
