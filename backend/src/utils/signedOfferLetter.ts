import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { pdfSafeText } from './offerAcceptanceEvidence';
import { findSignatureFields, type SignatureFields, type TextPage } from './offerLetterFields';
import { cleanPng, SIGNATURE_LIMITS } from './pngImage';

/**
 * The signed offer letter: the letter the candidate accepted, with their signature on its "Signature" line and the
 * date and place on their blank lines. A short record of who signed, when and where goes at the foot of that page.
 * A letter without a signature line (a scanned or unusual letter) gets an acceptance page at the end instead.
 */

const MAX_PAGES = 40;
const INK = rgb(0.06, 0.09, 0.16);
const GREY = rgb(0.39, 0.45, 0.55);

/** The text of the letter with its positions, page by page (bottom-left origin). */
export const readLetterText = async (letter: Buffer): Promise<TextPage[]> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/');
  const task = pdfjs.getDocument({ data: new Uint8Array(letter), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, standardFontDataUrl: `${fonts}/`, verbosity: 0 });
  try {
    const document = await task.promise;
    const pages: TextPage[] = [];
    for (let number = 1; number <= Math.min(document.numPages, MAX_PAGES); number += 1) {
      const page = await document.getPage(number);
      const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
      const content = await page.getTextContent();
      const runs = content.items.flatMap((item) => ('str' in item && item.str
        ? [{ text: item.str, x: Number(item.transform[4]) - left, y: Number(item.transform[5]) - bottom, width: item.width, size: Math.hypot(Number(item.transform[2]), Number(item.transform[3])) || item.height }]
        : []));
      pages.push({ width: right - left, height: top - bottom, runs });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
};

export type SignedLetterInput = {
  /** The typed or drawn signature as a PNG; without it the name is written in italics. */
  signature: Buffer | null;
  signerName: string;
  /** Written on a blank "Date" line (DD/MM/YYYY). */
  signedOn: string;
  /** Written on a blank "Place" line. */
  place: string;
  /** The record printed at the foot of the signature page. */
  statement: string;
  letterNo: string;
  companyName: string;
};

/** The standard fonts draw Latin characters only; the rupee sign is spelled out. */
const printable = (value: string) => pdfSafeText(value).replace(/₹/g, 'Rs.');

const wrap = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && font.widthOfTextAtSize(`${last} ${word}`, size) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

type Box = { x: number; y: number; width: number; height: number };

const drawSignature = (page: PDFPage, box: Box, image: PDFImage | null, name: string, script: PDFFont) => {
  if (image) {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    page.drawImage(image, { x: box.x, y: box.y, width: image.width * scale, height: image.height * scale });
    return;
  }
  const text = printable(name);
  const size = Math.min(22, box.width / Math.max(1, script.widthOfTextAtSize(text, 1)));
  page.drawText(text, { x: box.x, y: box.y + 7, size, font: script, color: INK });
};

const drawStatement = (page: PDFPage, statement: string, font: PDFFont) => {
  const { x, y, width } = page.getCropBox();
  const lines = wrap(printable(statement), font, 7.5, width - 96).slice(0, 3);
  lines.forEach((line, index) => page.drawText(line, { x: x + 48, y: y + 14 + (lines.length - 1 - index) * 9, size: 7.5, font, color: GREY }));
};

export const buildSignedOfferLetter = async (letter: Buffer, input: SignedLetterInput): Promise<Buffer> => {
  let fields: SignatureFields | null = null;
  try {
    fields = findSignatureFields(await readLetterText(letter));
  } catch (error) {
    console.warn('[offer] the signature line of a letter could not be located:', error instanceof Error ? error.message : error);
  }

  const document = await PDFDocument.load(letter);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const script = await document.embedFont(StandardFonts.TimesRomanBoldItalic);
  // Only a checked picture is embedded: a damaged one can keep the library busy for ever.
  const picture = input.signature ? cleanPng(input.signature, SIGNATURE_LIMITS) : null;
  const image = picture ? await document.embedPng(picture).catch(() => null) : null;
  const found = fields ? document.getPages()[fields.page] : undefined;

  if (fields && found && found.getRotation().angle % 360 === 0) {
    // Positions are measured from the visible page (the crop box, which is the whole page unless the file says so).
    const { x: left, y: bottom } = found.getCropBox();
    drawSignature(found, { ...fields.signature, x: left + fields.signature.x, y: bottom + fields.signature.y }, image, input.signerName, script);
    if (fields.date) found.drawText(printable(input.signedOn), { x: left + fields.date.x, y: bottom + fields.date.y, size: 10, font: regular, color: INK });
    if (fields.place) found.drawText(printable(input.place), { x: left + fields.place.x, y: bottom + fields.place.y, size: 10, font: regular, color: INK });
    drawStatement(found, input.statement, regular);
  } else {
    const first = document.getPages()[0];
    const size = first ? first.getCropBox() : { width: 595.28, height: 841.89 };
    const page = document.addPage([size.width, size.height]);
    const width = size.width - 96;
    let y = size.height - 72;
    const line = (text: string, options: { font?: PDFFont; size?: number; gap?: number; color?: ReturnType<typeof rgb> } = {}) => {
      const font = options.font ?? regular;
      const fontSize = options.size ?? 10.5;
      for (const part of wrap(printable(text), font, fontSize, width)) {
        page.drawText(part, { x: 48, y, size: fontSize, font, color: options.color ?? INK });
        y -= fontSize * 1.5;
      }
      y -= options.gap ?? 0;
    };
    line('Acceptance of offer', { font: bold, size: 16, gap: 2 });
    line(`${input.companyName} · Offer letter no. ${input.letterNo}`, { size: 9, color: GREY, gap: 16 });
    line(`I, ${input.signerName}, accept the offer of employment made in the offer letter above and agree to abide by its terms and conditions and the applicable policies of the Company.`, { gap: 14 });
    line(`Employee name: ${input.signerName}`, { gap: 30 });
    drawSignature(page, { x: 106, y: y - 2, width: 180, height: 34 }, image, input.signerName, script);
    page.drawLine({ start: { x: 104, y: y - 3 }, end: { x: 300, y: y - 3 }, thickness: 0.6, color: GREY });
    line('Signature:', { gap: 6 });
    line(`Date: ${input.signedOn}`);
    line(`Place: ${input.place}`);
    drawStatement(page, input.statement, regular);
  }
  return Buffer.from(await document.save());
};
