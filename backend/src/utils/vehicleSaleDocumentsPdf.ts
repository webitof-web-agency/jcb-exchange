import PDFDocument from 'pdfkit';

// Built-in Money Receipt and Bill of Supply, used when the DOCX stationery templates are not
// installed on the machine (they are provisioned separately) or no DOCX converter is available.
// Layouts follow the dealer money receipt and Tally-style bill of supply the business uses.

type Company = { name: string; addressLine: string; cin?: string | null; gstin?: string | null; state?: string | null };
type Signatory = { name: string; designation: string };

export type MoneyReceiptPdfData = {
  company: Company;
  title: string; // "MONEY RECEIPT" or "MONEY RECEIPT (DRAFT - NOT VALID)"
  receiptNumber: string;
  receiptDate: string;
  vehicleTitle: string;
  customerId: string;
  customerName: string;
  place: string;
  mode: string;
  txnNumber: string;
  txnDate: string;
  drawnOn: string;
  amount: string;
  amountInWords: string;
  remarks: string;
  signatory: Signatory;
};

export type BillOfSupplyPdfData = {
  company: Company;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerAddressLine: string;
  customerStateCode: string;
  placeOfSupply: string;
  description: string;
  hsn: string;
  amount: string;
  total: string;
  amountInWords: string;
  remarks: string;
  cancelled?: string | null;
  signatory: Signatory;
};

const INK = '#111827';
const MUTED = '#6B7280';
const RULE = '#9CA3AF';
const ACCENT = '#1E3A8A';   // Navy blue — JCB Exchange brand accent
const ACCENT_LIGHT = '#EFF6FF'; // Very light blue for header bg

const startDocument = (title: string) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: title } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
};

/**
 * Draws the logo image into the document at (x, y) with max size fitW × fitH.
 * Skips silently on any error (unsupported format, corrupt buffer, etc.).
 */
const drawLogo = (doc: PDFKit.PDFDocument, logo: Buffer | null | undefined, x: number, y: number, fitW = 90, fitH = 46) => {
  if (!logo) return;
  try {
    doc.image(logo, x, y, { fit: [fitW, fitH] });
  } catch {
    // Unsupported logo formats (SVG/WebP) are skipped; the document still renders.
  }
};

const dottedRule = (doc: PDFKit.PDFDocument, x: number, y: number, width: number) => {
  doc.moveTo(x, y).lineTo(x + width, y).dash(1.5, { space: 2 }).strokeColor(RULE).lineWidth(0.7).stroke().undash();
};

const fitCenteredHeaderText = (
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string,
  maxFontSize: number,
) => {
  let fontSize = maxFontSize;
  doc.font(font).fontSize(fontSize);
  while (fontSize > 5 && doc.widthOfString(text) > width) {
    fontSize -= 0.5;
    doc.fontSize(fontSize);
  }
  doc.text(text, x, y, { width, align: 'center', lineBreak: false });
};

/**
 * Draws the company header block:
 *   [ LOGO (left) | Company Name + Address + IDs (right of logo) ]
 * Returns the bottom-y of the header block.
 *
 * Industry-standard layout used by Indian dealership receipts:
 *   - Accent top bar (full width, 4 px)
 *   - White header area with logo left, company info center-right
 *   - Thin bottom rule
 */
const drawCompanyHeader = (
  doc: PDFKit.PDFDocument,
  company: Company,
  logo: Buffer | null | undefined,
  left: number,
  width: number,
  startY = 32,
): number => {
  const logoW = 90;
  const logoH = 46;
  const headerH = 70;

  // Accent top bar
  doc.rect(left, startY, width, 4).fill(ACCENT);

  // Header background
  doc.rect(left, startY + 4, width, headerH).fillAndStroke(ACCENT_LIGHT, '#BFDBFE');

  // Logo — left side, vertically centred in header
  const logoX = left + 10;
  const logoY = startY + 4 + (headerH - logoH) / 2;
  drawLogo(doc, logo, logoX, logoY, logoW, logoH);

  // Company name + details — right of logo, centred in remaining space
  const textX = left + logoW + 20;
  const textW = width - logoW - 24;
  const nameY = startY + 14;
  doc.fillColor(ACCENT);
  fitCenteredHeaderText(doc, company.name.toUpperCase(), textX, nameY, textW, 'Helvetica-Bold', 14);

  doc.fillColor('#374151');
  fitCenteredHeaderText(doc, company.addressLine, textX, doc.y + 2, textW, 'Helvetica', 8);

  const ids = company.gstin ? `GSTIN: ${company.gstin}` : '';
  if (ids) {
    doc.fillColor(MUTED);
    fitCenteredHeaderText(doc, ids, textX, doc.y + 2, textW, 'Helvetica', 7.5);
  }

  return startY + 4 + headerH + 4; // bottom of header + small gap
};

export const renderMoneyReceiptPdf = async (data: MoneyReceiptPdfData, logo?: Buffer | null) => {
  const { doc, done } = startDocument(`Money Receipt ${data.receiptNumber}`);
  const left = 36;
  const width = 523;

  // ── Company Header ────────────────────────────────────────────────────────
  let y = drawCompanyHeader(doc, data.company, logo, left, width, 32);

  // ── Document Title ────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(data.title, left, y, { width, align: 'center', underline: true });
  y = doc.y + 10;

  // ── Receipt No + Date ─────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  doc.text(`RECEIPT NO : ${data.receiptNumber}`, left, y, { width: width * 0.65 });
  doc.text(`DATE : ${data.receiptDate}`, left + width * 0.65, y, { width: width * 0.35, align: 'right' });
  y += 16;
  dottedRule(doc, left, y, width);
  y += 7;

  // ── Vehicle + Customer ID ─────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
  doc.text(`MODEL : ${data.vehicleTitle}`, left, y, { width: width * 0.5 });
  doc.text(`CUSTOMER ID : ${data.customerId}`, left + width * 0.5, y, { width: width * 0.5, align: 'right' });
  y = doc.y + 7;
  dottedRule(doc, left, y, width);
  y += 7;

  // ── Customer Name + Place ─────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
  doc.text('RECEIVED WITH THANKS FROM', left, y, { width: 170 });
  doc.text(`: ${data.customerName.toUpperCase()}`, left + 170, y, { width: width - 170 });
  y = doc.y + 4;
  doc.text('PLACE', left, y, { width: 170 });
  doc.text(`: ${data.place.toUpperCase()}`, left + 170, y, { width: width - 170 });
  y = doc.y + 7;
  dottedRule(doc, left, y, width);
  y += 7;

  // ── Payment Table ─────────────────────────────────────────────────────────
  const columns: Array<[string, number, 'left' | 'right']> = [
    ['MODE', 0, 'left'],
    ['TXN NO.', 0.18, 'left'],
    ['DATED', 0.38, 'left'],
    ['DRAWN ON', 0.56, 'left'],
    ['AMOUNT', 0.78, 'right'],
  ];
  const row = (values: string[], headerRow = false) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(headerRow ? ACCENT : INK);
    columns.forEach(([, offset, align], index) => {
      const next = columns[index + 1]?.[1] ?? 1;
      doc.text(values[index] || '-', left + width * offset, y, { width: width * (next - offset) - 4, align });
    });
  };
  // Header row with light background
  doc.rect(left, y - 2, width, 16).fill('#EFF6FF');
  row(columns.map(([label]) => label), true);
  y += 14;
  dottedRule(doc, left, y, width);
  y += 6;
  row([data.mode, data.txnNumber, data.txnDate, data.drawnOn, data.amount]);
  y += 24;

  // ── Amount in Words ───────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    .text(data.amountInWords.toUpperCase(), left, y, { width });
  y = doc.y + 10;
  dottedRule(doc, left, y, width);
  y += 7;

  // ── Remarks ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
    .text(`REMARKS : ${data.remarks.toUpperCase()}`, left, y, { width, lineGap: 2 });
  y = doc.y + 20;

  // ── Signature Block ───────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    .text(`FOR, ${data.company.name.toUpperCase()}`, left + width - 260, y, { width: 260, align: 'right' });
  y += 52;
  doc.text("CUSTOMER'S SIGNATURE", left, y, { width: 200 });
  doc.text('AUTHORISED SIGNATORY', left + width - 260, y, { width: 260, align: 'right' });
  const signatoryLine = data.signatory.name === data.signatory.designation
    ? ''
    : `${data.signatory.name} (${data.signatory.designation})`;
  if (signatoryLine) {
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(signatoryLine, left + width - 260, y + 12, { width: 260, align: 'right' });
  }
  y += 28;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(0.8).stroke();

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
    .text(
      `Computer generated · ${data.receiptNumber}`,
      left,
      doc.page.height - doc.page.margins.bottom - 14,
      { width, align: 'center', lineBreak: false },
    );

  doc.end();
  return done;
};

export const renderBillOfSupplyPdf = async (data: BillOfSupplyPdfData, logo?: Buffer | null) => {
  const { doc, done } = startDocument(`Bill of Supply ${data.invoiceNumber}`);
  const left = 40;
  const width = 515;
  const split = left + 290;
  const right = left + width;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text('Bill of Supply', left, 34, { width, align: 'center' });
  const top = 56;
  doc.lineWidth(0.8).strokeColor(INK);

  // Header: seller (left) and invoice number/date (right), then buyer.
  const headerHeight = 96;
  doc.rect(left, top, width, headerHeight).stroke();
  doc.moveTo(split, top).lineTo(split, top + headerHeight).stroke();
  drawLogo(doc, logo, split - 96, top + 6);
  doc.font('Helvetica-Bold').fontSize(9.5).text(data.company.name, left + 5, top + 5, { width: 280 - 100 });
  doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(data.company.addressLine, left + 5, doc.y + 1, { width: 280 - 100 });
  if (data.company.gstin) doc.text(`GSTIN/UIN: ${data.company.gstin}`, left + 5, doc.y + 1, { width: 280 });
  if (data.company.cin) doc.text(`CIN: ${data.company.cin}`, left + 5, doc.y + 1, { width: 280 });
  if (data.company.state) doc.text(`State Name : ${data.company.state}`, left + 5, doc.y + 1, { width: 280 });
  const metaWidth = (width - 290) / 2;
  doc.moveTo(split + metaWidth, top).lineTo(split + metaWidth, top + 34).stroke();
  doc.moveTo(split, top + 34).lineTo(right, top + 34).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Invoice No.', split + 4, top + 4).text('Dated', split + metaWidth + 4, top + 4);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(data.invoiceNumber, split + 4, top + 16, { width: metaWidth - 8 }).text(data.invoiceDate, split + metaWidth + 4, top + 16, { width: metaWidth - 8 });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Place of Supply', split + 4, top + 40);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(data.placeOfSupply, split + 4, top + 52, { width: width - 298 });
  if (data.cancelled) doc.font('Helvetica-Bold').fontSize(9).fillColor('#B91C1C').text(data.cancelled, split + 4, top + 70, { width: width - 298 });

  const buyerTop = top + headerHeight;
  const buyerHeight = 66;
  doc.fillColor(INK).rect(left, buyerTop, width, buyerHeight).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Buyer (Bill to)', left + 5, buyerTop + 4);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(data.customerName, left + 5, buyerTop + 16, { width: width - 10 });
  doc.font('Helvetica').fontSize(8.5).text(data.customerAddressLine, left + 5, doc.y + 1, { width: width - 10 });
  doc.text(`State Name : ${data.customerStateCode}`, left + 5, doc.y + 1, { width: width - 10 });

  // Items.
  const itemsTop = buyerTop + buyerHeight;
  const itemsHeight = 330;
  const colSl = left + 26;
  const colHsn = right - 150;
  const colAmount = right - 85;
  doc.rect(left, itemsTop, width, itemsHeight).stroke();
  [colSl, colHsn, colAmount].forEach((x) => doc.moveTo(x, itemsTop).lineTo(x, itemsTop + itemsHeight).stroke());
  doc.moveTo(left, itemsTop + 20).lineTo(right, itemsTop + 20).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('Sl No.', left + 2, itemsTop + 6, { width: 24, align: 'center' });
  doc.text('Description of Goods', colSl, itemsTop + 6, { width: colHsn - colSl, align: 'center' });
  doc.text('HSN/SAC', colHsn, itemsTop + 6, { width: colAmount - colHsn, align: 'center' });
  doc.text('Amount', colAmount, itemsTop + 6, { width: right - colAmount - 4, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  doc.text('1', left + 2, itemsTop + 28, { width: 24, align: 'center' });
  doc.text(data.description, colSl + 5, itemsTop + 28, { width: colHsn - colSl - 10 });
  doc.font('Helvetica').fontSize(9).text(data.hsn, colHsn, itemsTop + 28, { width: colAmount - colHsn, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(9.5).text(data.amount, colAmount, itemsTop + 28, { width: right - colAmount - 4, align: 'right' });
  const totalY = itemsTop + itemsHeight;
  doc.rect(left, totalY, width, 20).stroke();
  doc.moveTo(colAmount, totalY).lineTo(colAmount, totalY + 20).stroke();
  doc.font('Helvetica').fontSize(9).text('Total', colSl, totalY + 6, { width: colAmount - colSl - 8, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).text(data.total, colAmount, totalY + 5, { width: right - colAmount - 4, align: 'right' });

  // Footer: amount in words, remarks, declaration, signatory.
  const footerTop = totalY + 20;
  const footerHeight = 150;
  doc.rect(left, footerTop, width, footerHeight).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Amount Chargeable (in words)', left + 5, footerTop + 4);
  doc.text('E. & O.E', right - 60, footerTop + 4, { width: 55, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(data.amountInWords, left + 5, footerTop + 15, { width: width - 10 });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text('Remarks:', left + 5, doc.y + 6);
  doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(data.remarks, left + 5, doc.y + 1, { width: width - 10, lineGap: 1 });
  const declTop = footerTop + footerHeight - 48;
  doc.moveTo(left + 260, declTop).lineTo(left + 260, footerTop + footerHeight).stroke();
  doc.moveTo(left + 260, declTop).lineTo(right, declTop).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(INK).text('Declaration', left + 5, declTop + 4, { underline: true });
  doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', left + 5, declTop + 14, { width: 250 });
  doc.font('Helvetica-Bold').fontSize(8.5).text(`for ${data.company.name}`, left + 264, declTop + 4, { width: width - 268, align: 'right' });
  const signatoryLine = data.signatory.name === 'Authorised Signatory' ? 'Authorised Signatory' : `${data.signatory.name} - Authorised Signatory`;
  doc.font('Helvetica').fontSize(8).text(signatoryLine, left + 264, footerTop + footerHeight - 13, { width: width - 268, align: 'right' });
  doc.fontSize(8).fillColor(MUTED).text('This is a Computer Generated Invoice', left, footerTop + footerHeight + 6, { width, align: 'center' });

  doc.end();
  return done;
};
