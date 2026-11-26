import PDFDocument from 'pdfkit';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type ProfitInvoicePdfData = {
  company: {
    name: string;
    addressLine: string;
    cin?: string | null;
    gstin?: string | null;
    state?: string | null;
  };
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerAddressLine: string;
  customerStateCode: string;
  placeOfSupply: string;
  vehicle: {
    title: string;
    registrationNumber: string;
    chassisNumber: string;
    engineNumber?: string | null;
    category?: string | null;
  };
  relatedBillOfSupplyNumber?: string | null;
  finance: {
    purchaseAmount: number;
    saleAmount: number;
    expenses: number;
    expenseDetails?: string;
    grossMargin: number;
    taxableValue: number;
    gstRatePercent: number;
    isIntraState: boolean;
    cgst: number;
    sgst: number;
    igst: number;
    totalGst: number;
    totalInvoiceAmount: number;
    netProfitAfterGst: number;
  };
  amountInWords: string;
  remarksBullets: string[];
  signatory: {
    name: string;
    designation: string;
  };
};

const INK = '#111827';
const MUTED = '#4B5563';
const ORANGE = '#F5A800';
const BG_HEADER = '#F9FAFB';

const rupeesText = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Scales font size down slightly when needed so a value stays cleanly on one line inside a cell. */
const fitSingleLineText = (
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string,
  maxSize: number,
  align: 'left' | 'center' | 'right' = 'right',
  minSize = 5.2,
) => {
  let size = maxSize;
  doc.font(font).fontSize(size);
  while (size > minSize && doc.widthOfString(text) > width) {
    size -= 0.5;
    doc.fontSize(size);
  }
  doc.text(text, x, y, { width, align, lineBreak: false });
};

const isJpegOrPng = (buffer?: Buffer | null): buffer is Buffer =>
  Boolean(
    buffer &&
    buffer.length > 4 &&
    ((buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)),
  );

export const renderProfitGstInvoicePdf = async (
  data: ProfitInvoicePdfData,
  logo?: Buffer | null,
): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
    info: { Title: `Tax Invoice - Margin Scheme ${data.invoiceNumber}` },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 36;
  const width = 523;
  const right = left + width;

  // 1. Top Header Area (Logo left, Company right) — Identical to Bill of Supply
  const headerTop = 26;
  let drawnLogo = false;
  if (isJpegOrPng(logo)) {
    try {
      doc.image(logo, left, headerTop, { fit: [125, 48] });
      drawnLogo = true;
    } catch { }
  }
  if (!drawnLogo) {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'templates', 'vehicle-sale', 'jcb-exchange-logo.jpg'),
        path.resolve(process.cwd(), 'backend', 'templates', 'vehicle-sale', 'jcb-exchange-logo.jpg'),
        path.resolve(__dirname, '..', '..', 'templates', 'vehicle-sale', 'jcb-exchange-logo.jpg'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) {
          doc.image(readFileSync(p), left, headerTop, { fit: [125, 48] });
          drawnLogo = true;
          break;
        }
      }
    } catch { }
  }

  // Company details right aligned
  const companyRightX = left + 140;
  const companyRightW = width - 140;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text(data.company.name.toUpperCase(), companyRightX, headerTop + 2, { width: companyRightW, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(data.company.addressLine, companyRightX, doc.y + 2, { width: companyRightW, align: 'right', lineGap: 1 });
  if (data.company.gstin) {
    doc.text(
      `GSTIN: ${data.company.gstin}${data.company.state ? `  |  State: ${data.company.state}` : ''}`,
      companyRightX,
      doc.y + 1,
      { width: companyRightW, align: 'right' },
    );
  }

  // 2. Orange Separator Line — Identical to Bill of Supply
  const orangeY = Math.max(doc.y + 6, headerTop + 54);
  doc.rect(left, orangeY, width, 2).fill(ORANGE);

  // 3. Document Title
  const titleY = orangeY + 6;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text('TAX INVOICE — MARGIN SCHEME', left, titleY, { width, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      'Issued under Rule 32(5) of CGST Rules, 2017 (Taxable Supply of Second-Hand Machinery / Capital Goods)',
      left,
      titleY + 13,
      { width, align: 'center' },
    );

  // 4. Seller & Invoice Details (Side by Side, uniform value columns & dynamic height)
  const tableTop = titleY + 25;
  const colSplit = left + 265;
  const leftBoxW = 265;
  const rightBoxW = width - leftBoxW;
  doc.lineWidth(0.8).strokeColor(INK);

  const secHdrH = 16;
  doc.rect(left, tableTop, leftBoxW, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.rect(colSplit, tableTop, rightBoxW, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(INK)
    .text('Seller / Supplier Details', left + 6, tableTop + 4)
    .text('Tax Invoice Details', colSplit + 6, tableTop + 4);

  const sellerValX = left + 64;
  const sellerValW = leftBoxW - 70;
  const invValX = colSplit + 76;
  const invValW = rightBoxW - 82;
  const infoTop = tableTop + secHdrH;

  doc.font('Helvetica').fontSize(7.5);
  const sellerNameH = Math.max(11, Math.ceil(doc.heightOfString(data.company.name, { width: sellerValW })));
  const sellerAddrH = Math.max(11, Math.ceil(doc.heightOfString(data.company.addressLine, { width: sellerValW, lineGap: 1 })));
  const sellerContentH = 6 + sellerNameH + 4 + sellerAddrH + 4 + 11 + 4 + 11 + 6;
  const placeSupplyText = `${data.placeOfSupply} (${data.finance.isIntraState ? 'Intra-state' : 'Inter-state'})`;
  const placeSupplyH = Math.max(11, Math.ceil(doc.heightOfString(placeSupplyText, { width: invValW })));
  const invContentH = 6 + 11 + 5 + 11 + 5 + 11 + 5 + placeSupplyH + 6;
  const infoH = Math.max(70, sellerContentH, invContentH);

  doc.rect(left, infoTop, leftBoxW, infoH).stroke();
  doc.rect(colSplit, infoTop, rightBoxW, infoH).stroke();

  // Left: Seller Info
  let sy = infoTop + 6;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Name:', left + 6, sy, { width: 54 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.name, sellerValX, sy, { width: sellerValW });
  sy += sellerNameH + 4;

  doc.font('Helvetica-Bold').fontSize(7.5).text('Address:', left + 6, sy, { width: 54 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.addressLine, sellerValX, sy, { width: sellerValW, lineGap: 1 });
  sy += sellerAddrH + 4;

  doc.font('Helvetica-Bold').fontSize(7.5).text('GSTIN:', left + 6, sy, { width: 54 });
  fitSingleLineText(doc, data.company.gstin || 'Not configured', sellerValX, sy, sellerValW, 'Helvetica', 7.5, 'left', 6);
  sy += 15;

  doc.font('Helvetica-Bold').fontSize(7.5).text('State / Code:', left + 6, sy, { width: 56 });
  fitSingleLineText(doc, data.company.state || 'Chhattisgarh', sellerValX, sy, sellerValW, 'Helvetica', 7.5, 'left', 6);

  // Right: Invoice Info
  let iy = infoTop + 6;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Invoice No:', colSplit + 6, iy, { width: 66 });
  doc.fillColor('#B45309');
  fitSingleLineText(doc, data.invoiceNumber, invValX, iy, invValW, 'Helvetica-Bold', 7.5, 'left', 6);
  iy += 16;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Invoice Date:', colSplit + 6, iy, { width: 66 });
  fitSingleLineText(doc, data.invoiceDate, invValX, iy, invValW, 'Helvetica', 7.5, 'left', 6);
  iy += 16;

  doc.font('Helvetica-Bold').fontSize(7.5).text('Bill of Supply:', colSplit + 6, iy, { width: 68 });
  fitSingleLineText(doc, data.relatedBillOfSupplyNumber || '—', invValX, iy, invValW, 'Helvetica', 7.5, 'left', 6);
  iy += 16;

  doc.font('Helvetica-Bold').fontSize(7.5).text('Place of Supply:', colSplit + 6, iy, { width: 70 });
  doc.font('Helvetica').fontSize(7.5).text(placeSupplyText, invValX, iy, { width: invValW });

  // 5. Buyer Box (Bill to) — Dynamic height & uniform alignment
  const buyerHdrTop = infoTop + infoH;
  doc.rect(left, buyerHdrTop, width, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Buyer (Bill to)', left + 6, buyerHdrTop + 4);

  const buyerBodyTop = buyerHdrTop + secHdrH;
  doc.font('Helvetica').fontSize(7.5);
  const buyerAddrH = Math.max(11, Math.ceil(doc.heightOfString(data.customerAddressLine, { width: 236, lineGap: 1 })));
  const buyerBodyH = Math.max(36, 6 + 12 + 4 + buyerAddrH + 6);
  doc.rect(left, buyerBodyTop, width, buyerBodyH).stroke();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Name:', left + 6, buyerBodyTop + 6, { width: 44 });
  fitSingleLineText(doc, data.customerName, left + 52, buyerBodyTop + 6, 236, 'Helvetica-Bold', 8, 'left', 6);

  doc.font('Helvetica-Bold').fontSize(7.5).text('Address:', left + 6, buyerBodyTop + 21, { width: 44 });
  doc.font('Helvetica').fontSize(7.5).text(data.customerAddressLine, left + 52, buyerBodyTop + 21, { width: 236, lineGap: 1 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('State / Code:', left + 300, buyerBodyTop + 6, { width: 62 });
  fitSingleLineText(doc, data.customerStateCode || data.placeOfSupply, left + 365, buyerBodyTop + 6, 150, 'Helvetica', 7.5, 'left', 6);

  doc.font('Helvetica-Bold').fontSize(7.5).text('GSTIN / Type:', left + 300, buyerBodyTop + 21, { width: 62 });
  fitSingleLineText(doc, 'Unregistered (Consumer / B2C)', left + 365, buyerBodyTop + 21, 150, 'Helvetica', 7.5, 'left', 6);

  // 6. Vehicle / Machinery Specifications Box (Single-line scaled fields — zero collision)
  const vehHdrTop = buyerBodyTop + buyerBodyH;
  doc.rect(left, vehHdrTop, width, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Vehicle / Machinery Specifications', left + 6, vehHdrTop + 4);

  const vehBodyTop = vehHdrTop + secHdrH;
  const vehBodyH = 38;
  doc.rect(left, vehBodyTop, width, vehBodyH).stroke();

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Vehicle:', left + 6, vehBodyTop + 6, { width: 38 });
  fitSingleLineText(doc, data.vehicle.title, left + 46, vehBodyTop + 6, 298, 'Helvetica-Bold', 7.5, 'left', 5.5);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Reg. No:', left + 355, vehBodyTop + 6, { width: 45 });
  doc.fillColor('#B45309');
  fitSingleLineText(doc, data.vehicle.registrationNumber || 'N/A', left + 402, vehBodyTop + 6, 115, 'Helvetica-Bold', 7.5, 'left', 6);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Chassis No:', left + 6, vehBodyTop + 22, { width: 52 });
  fitSingleLineText(doc, data.vehicle.chassisNumber || 'N/A', left + 60, vehBodyTop + 22, 122, 'Helvetica', 7.5, 'left', 5.5);

  doc.font('Helvetica-Bold').fontSize(7.5).text('Engine No:', left + 190, vehBodyTop + 22, { width: 48 });
  fitSingleLineText(doc, data.vehicle.engineNumber || '—', left + 240, vehBodyTop + 22, 108, 'Helvetica', 7.5, 'left', 5.5);

  doc.font('Helvetica-Bold').fontSize(7.5).text('Category:', left + 355, vehBodyTop + 22, { width: 45 });
  fitSingleLineText(doc, data.vehicle.category || 'Second-hand Heavy Equipment', left + 402, vehBodyTop + 22, 115, 'Helvetica', 7.5, 'left', 5.5);

  // 7. Line Items & Tax Breakdown Table
  // Total width: 523
  // Columns: Sl(20), Description(159), HSN(38), Taxable(66), Rate(28), CGST(50), SGST(50), IGST(48), Total(64) = 523
  const itemsTop = vehBodyTop + vehBodyH;
  const itemHdrH = 22;

  const colSl = left + 20;
  const colDesc = colSl;
  const colHsn = left + 179;
  const colTaxable = left + 217;
  const colRate = left + 283;
  const colCgst = left + 311;
  const colSgst = left + 361;
  const colIgst = left + 411;
  const colTotal = left + 459;

  doc.rect(left, itemsTop, width, itemHdrH).fillAndStroke(BG_HEADER, INK);
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, itemsTop).lineTo(x, itemsTop + itemHdrH).stroke(),
  );

  const hdrTextY = itemsTop + 7.5;
  doc.fillColor(INK);
  fitSingleLineText(doc, 'Sl.', left + 2, hdrTextY, 16, 'Helvetica-Bold', 6.8, 'center', 5.5);
  fitSingleLineText(doc, 'Description of Supply (Margin Scheme)', colDesc + 4, hdrTextY, colHsn - colDesc - 8, 'Helvetica-Bold', 6.8, 'center', 5.5);
  fitSingleLineText(doc, 'HSN/SAC', colHsn + 2, hdrTextY, colTaxable - colHsn - 4, 'Helvetica-Bold', 6.8, 'center', 5.5);
  fitSingleLineText(doc, 'Taxable Base', colTaxable + 2, hdrTextY, colRate - colTaxable - 4, 'Helvetica-Bold', 6.8, 'right', 5.5);
  fitSingleLineText(doc, 'Rate', colRate + 1, hdrTextY, colCgst - colRate - 2, 'Helvetica-Bold', 6.8, 'center', 5.5);
  fitSingleLineText(doc, 'CGST (9%)', colCgst + 2, hdrTextY, colSgst - colCgst - 4, 'Helvetica-Bold', 6.8, 'right', 5.5);
  fitSingleLineText(doc, 'SGST (9%)', colSgst + 2, hdrTextY, colIgst - colSgst - 4, 'Helvetica-Bold', 6.8, 'right', 5.5);
  fitSingleLineText(doc, 'IGST (18%)', colIgst + 2, hdrTextY, colTotal - colIgst - 4, 'Helvetica-Bold', 6.8, 'right', 5.5);
  fitSingleLineText(doc, 'Total (Gross)', colTotal + 2, hdrTextY, right - colTotal - 4, 'Helvetica-Bold', 6.8, 'right', 5.5);

  // Items Area (Height 54 pt — clean 3-line description & single-line scaled amounts)
  const itemsAreaH = 54;
  const itemsAreaTop = itemsTop + itemHdrH;
  doc.rect(left, itemsAreaTop, width, itemsAreaH).stroke();
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, itemsAreaTop).lineTo(x, itemsAreaTop + itemsAreaH).stroke(),
  );

  const rowY = itemsAreaTop + 7;
  doc.font('Helvetica').fontSize(7.5).fillColor(INK);
  doc.text('1', left + 2, itemsAreaTop + 21, { width: 16, align: 'center' });

  const descX = colDesc + 5;
  const descW = colHsn - colDesc - 10;
  fitSingleLineText(doc, 'Margin on supply of second-hand machinery', descX, rowY, descW, 'Helvetica-Bold', 7.2, 'left', 5.5);
  fitSingleLineText(doc, data.vehicle.title, descX, rowY + 13, descW, 'Helvetica', 6.8, 'left', 5.2);
  fitSingleLineText(
    doc,
    `Reg. No: ${data.vehicle.registrationNumber || 'N/A'}${data.vehicle.chassisNumber ? ` · Chassis: ${data.vehicle.chassisNumber}` : ''}`,
    descX,
    rowY + 25,
    descW,
    'Helvetica',
    6.4,
    'left',
    5,
  );

  const numY = itemsAreaTop + 21;
  doc.font('Helvetica').fontSize(7.5).fillColor(INK).text('-', colHsn + 2, numY, { width: colTaxable - colHsn - 4, align: 'center', lineBreak: false });

  fitSingleLineText(doc, rupeesText(data.finance.taxableValue), colTaxable + 2, numY, colRate - colTaxable - 4, 'Helvetica', 7, 'right', 5.2);
  fitSingleLineText(doc, `${data.finance.gstRatePercent}%`, colRate + 1, numY, colCgst - colRate - 2, 'Helvetica', 7, 'center', 5.5);
  fitSingleLineText(doc, data.finance.isIntraState ? rupeesText(data.finance.cgst) : '—', colCgst + 2, numY, colSgst - colCgst - 4, 'Helvetica', 7, 'right', 5.2);
  fitSingleLineText(doc, data.finance.isIntraState ? rupeesText(data.finance.sgst) : '—', colSgst + 2, numY, colIgst - colSgst - 4, 'Helvetica', 7, 'right', 5.2);
  fitSingleLineText(doc, !data.finance.isIntraState ? rupeesText(data.finance.igst) : '—', colIgst + 2, numY, colTotal - colIgst - 4, 'Helvetica', 7, 'right', 5.2);
  fitSingleLineText(doc, rupeesText(data.finance.totalInvoiceAmount), colTotal + 2, numY, right - colTotal - 4, 'Helvetica-Bold', 7, 'right', 5.2);

  // Totals Row
  const totalRowH = 20;
  const totalRowTop = itemsAreaTop + itemsAreaH;
  doc.rect(left, totalRowTop, width, totalRowH).fillAndStroke(BG_HEADER, INK);
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, totalRowTop).lineTo(x, totalRowTop + totalRowH).stroke(),
  );

  const totalTextY = totalRowTop + 6.5;
  doc.font('Helvetica-Bold').fontSize(7).fillColor(INK);
  doc.text('Total', colDesc + 4, totalTextY, { width: colHsn - colDesc - 8, align: 'right' });
  doc.text('-', colHsn + 2, totalTextY, { width: colTaxable - colHsn - 4, align: 'center' });
  fitSingleLineText(doc, rupeesText(data.finance.taxableValue), colTaxable + 2, totalTextY, colRate - colTaxable - 4, 'Helvetica-Bold', 7, 'right', 5.2);
  doc.text('', colRate + 1, totalTextY, { width: colCgst - colRate - 2, align: 'center' });
  fitSingleLineText(doc, data.finance.isIntraState ? rupeesText(data.finance.cgst) : '—', colCgst + 2, totalTextY, colSgst - colCgst - 4, 'Helvetica-Bold', 7, 'right', 5.2);
  fitSingleLineText(doc, data.finance.isIntraState ? rupeesText(data.finance.sgst) : '—', colSgst + 2, totalTextY, colIgst - colSgst - 4, 'Helvetica-Bold', 7, 'right', 5.2);
  fitSingleLineText(doc, !data.finance.isIntraState ? rupeesText(data.finance.igst) : '—', colIgst + 2, totalTextY, colTotal - colIgst - 4, 'Helvetica-Bold', 7, 'right', 5.2);
  fitSingleLineText(doc, rupeesText(data.finance.totalInvoiceAmount), colTotal + 2, totalTextY, right - colTotal - 4, 'Helvetica-Bold', 7, 'right', 5.2);

  // 8. Amount in Words Box (dynamic height if words wrap)
  const wordsText = `Total Invoice Amount in Words: ${data.amountInWords}`;
  doc.font('Helvetica-Bold').fontSize(7.5);
  const wordsH = Math.max(18, Math.ceil(doc.heightOfString(wordsText, { width: width - 12 }) + 10));
  const wordsTop = totalRowTop + totalRowH;
  doc.rect(left, wordsTop, width, wordsH).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text('Total Invoice Amount in Words: ', left + 6, wordsTop + 5, { width: width - 12, continued: true })
    .font('Helvetica')
    .text(data.amountInWords);

  // 9. Remarks & Profit Margin Computation Notes (dynamically wrapped bullets — zero clipping)
  const remarksTop = wordsTop + wordsH;
  const notesInnerW = width - 16;
  doc.font('Helvetica').fontSize(6.8);
  let bulletsContentH = 18;
  for (const bullet of data.remarksBullets) {
    bulletsContentH += Math.ceil(doc.heightOfString(bullet, { width: notesInnerW, lineGap: 1.5 })) + 2.5;
  }
  const remarksH = Math.max(104, bulletsContentH + 6);
  doc.rect(left, remarksTop, width, remarksH).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text('Profit Margin Computation & GST Accounting Notes (Rule 32(5), CGST Rules 2017):', left + 6, remarksTop + 5);

  let bulletY = remarksTop + 17;
  doc.font('Helvetica').fontSize(6.8).fillColor(INK);
  data.remarksBullets.forEach((bullet) => {
    doc.text(bullet, left + 8, bulletY, { width: notesInnerW, lineGap: 1.5 });
    bulletY = doc.y + 2.5;
  });

  // 10. Declaration & Signatory Box (Completely separate, zero overlap)
  const bottomBoxH = 70;
  const bottomBoxTop = remarksTop + remarksH;
  const signSplit = left + 270;
  doc.rect(left, bottomBoxTop, width, bottomBoxH).stroke();
  doc.moveTo(signSplit, bottomBoxTop).lineTo(signSplit, bottomBoxTop + bottomBoxH).stroke();

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Declaration:', left + 6, bottomBoxTop + 5);
  doc
    .font('Helvetica')
    .fontSize(6.6)
    .fillColor(MUTED)
    .text(
      'We declare that this invoice shows the actual profit margin and tax payable under the Margin Scheme (Rule 32(5) of CGST Rules, 2017) for supply of second-hand capital goods / machinery. No input tax credit was availed on the purchase of this machinery.',
      left + 6,
      bottomBoxTop + 15,
      { width: signSplit - left - 12, lineGap: 1.2 },
    );
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('(Company Seal / Stamp)', left + 6, bottomBoxTop + 54);

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(INK)
    .text(`For ${data.company.name.toUpperCase()}`, signSplit + 6, bottomBoxTop + 5, { width: right - signSplit - 12, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text('Signature: __________________________', signSplit + 6, bottomBoxTop + 30, { width: right - signSplit - 12, align: 'right' });
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text(`Name: ${data.signatory.name}`, signSplit + 6, bottomBoxTop + 42, { width: right - signSplit - 12, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(`Designation: ${data.signatory.designation}`, signSplit + 6, bottomBoxTop + 53, { width: right - signSplit - 12, align: 'right' });

  // 11. Bottom Footer Line (Registered Office, Email, Mobile) — Identical to Bill of Supply
  const footerY = 798;
  doc.rect(left, footerY - 4, width, 1.5).fill(ORANGE);
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      'Registered Office: SH No. 08, 1st Floor, Housing Board Complex, Khamhardih, Shanker Nagar, Raipur, Chhattisgarh - 492004',
      left,
      footerY + 2,
      { width, align: 'center' },
    );
  doc.text('Email: arjun16081991@gmail.com   |   Mob: +91 91834 33895', left, footerY + 11, { width, align: 'center' });

  doc.end();
  return done;
};
