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
    } catch {}
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
    } catch {}
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

  // 4. Seller & Invoice Details (Side by Side)
  const tableTop = titleY + 25;
  const colSplit = left + 265;
  const leftBoxW = 265;
  const rightBoxW = width - leftBoxW;
  doc.lineWidth(0.8).strokeColor(INK);

  const secHdrH = 15;
  doc.rect(left, tableTop, leftBoxW, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.rect(colSplit, tableTop, rightBoxW, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(INK)
    .text('Seller / Supplier Details', left + 6, tableTop + 3.5)
    .text('Tax Invoice Details', colSplit + 6, tableTop + 3.5);

  const infoH = 68;
  const infoTop = tableTop + secHdrH;
  doc.rect(left, infoTop, leftBoxW, infoH).stroke();
  doc.rect(colSplit, infoTop, rightBoxW, infoH).stroke();

  // Left: Seller Info
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Name: ', left + 6, infoTop + 5, { width: 32 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.name, left + 38, infoTop + 5, { width: leftBoxW - 44 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Address: ', left + 6, infoTop + 18, { width: 40 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.addressLine, left + 46, infoTop + 18, {
    width: leftBoxW - 52,
    height: 22,
    ellipsis: true,
  });

  doc.font('Helvetica-Bold').fontSize(7.5).text('GSTIN: ', left + 6, infoTop + 40, { width: 36 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.gstin || 'Not configured', left + 42, infoTop + 40, { width: leftBoxW - 48 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('State / Code: ', left + 6, infoTop + 52, { width: 56 });
  doc.font('Helvetica').fontSize(7.5).text(data.company.state || 'Chhattisgarh', left + 62, infoTop + 52, { width: leftBoxW - 68 });

  // Right: Invoice Info
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Invoice No: ', colSplit + 6, infoTop + 5, { width: 55 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#B45309').text(data.invoiceNumber, colSplit + 62, infoTop + 5, { width: rightBoxW - 68, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Invoice Date: ', colSplit + 6, infoTop + 20, { width: 58 });
  doc.font('Helvetica').fontSize(7.5).text(data.invoiceDate, colSplit + 66, infoTop + 20, { width: rightBoxW - 72 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Bill of Supply: ', colSplit + 6, infoTop + 35, { width: 66 });
  doc.font('Helvetica').fontSize(7.5).text(data.relatedBillOfSupplyNumber || '—', colSplit + 74, infoTop + 35, { width: rightBoxW - 80 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Place of Supply: ', colSplit + 6, infoTop + 50, { width: 72 });
  doc.font('Helvetica').fontSize(7.5).text(
    `${data.placeOfSupply} (${data.finance.isIntraState ? 'Intra-state' : 'Inter-state'})`,
    colSplit + 80,
    infoTop + 50,
    { width: rightBoxW - 86 },
  );

  // 5. Buyer Box (Bill to) — Identical to Bill of Supply
  const buyerHdrTop = infoTop + infoH;
  doc.rect(left, buyerHdrTop, width, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Buyer (Bill to)', left + 6, buyerHdrTop + 3.5);

  const buyerBodyTop = buyerHdrTop + secHdrH;
  const buyerBodyH = 34;
  doc.rect(left, buyerBodyTop, width, buyerBodyH).stroke();

  doc.font('Helvetica-Bold').fontSize(8).text('Name: ', left + 6, buyerBodyTop + 5, { width: 32 });
  doc.font('Helvetica-Bold').fontSize(8).text(data.customerName, left + 38, buyerBodyTop + 5, { width: 250, lineBreak: false, ellipsis: true });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Address: ', left + 6, buyerBodyTop + 18, { width: 42 });
  doc.font('Helvetica').fontSize(7.5).text(data.customerAddressLine, left + 48, buyerBodyTop + 18, {
    width: 240,
    height: 12,
    ellipsis: true,
  });

  doc.font('Helvetica-Bold').fontSize(7.5).text('State / Code: ', left + 300, buyerBodyTop + 5, { width: 62 });
  doc.font('Helvetica').fontSize(7.5).text(data.customerStateCode || data.placeOfSupply, left + 365, buyerBodyTop + 5, { width: 150 });

  doc.font('Helvetica-Bold').fontSize(7.5).text('GSTIN / Type: ', left + 300, buyerBodyTop + 18, { width: 62 });
  doc.font('Helvetica').fontSize(7.5).text('Unregistered (Consumer / B2C)', left + 365, buyerBodyTop + 18, { width: 150 });

  // 6. Vehicle / Machinery Specifications Box (Wide, completely immune to text wrapping & collision)
  const vehHdrTop = buyerBodyTop + buyerBodyH;
  doc.rect(left, vehHdrTop, width, secHdrH).fillAndStroke(BG_HEADER, INK);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Vehicle / Machinery Specifications', left + 6, vehHdrTop + 3.5);

  const vehBodyTop = vehHdrTop + secHdrH;
  const vehBodyH = 36;
  doc.rect(left, vehBodyTop, width, vehBodyH).stroke();

  // Line 1: Vehicle Title (Wide 310pt) & Registration Number
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Vehicle: ', left + 6, vehBodyTop + 5, { width: 38 });
  doc.font('Helvetica-Bold').fontSize(7.5).text(data.vehicle.title, left + 45, vehBodyTop + 5, { width: 300, lineBreak: false, ellipsis: true });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Reg. No: ', left + 355, vehBodyTop + 5, { width: 45 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#B45309').text(data.vehicle.registrationNumber || 'N/A', left + 402, vehBodyTop + 5, { width: 115, lineBreak: false });

  // Line 2: Chassis No, Engine No, Category (Zero collision)
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Chassis No: ', left + 6, vehBodyTop + 20, { width: 52 });
  doc.font('Helvetica').fontSize(7.5).text(data.vehicle.chassisNumber || 'N/A', left + 58, vehBodyTop + 20, { width: 125, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Engine No: ', left + 190, vehBodyTop + 20, { width: 48 });
  doc.font('Helvetica').fontSize(7.5).text(data.vehicle.engineNumber || '—', left + 238, vehBodyTop + 20, { width: 110, lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(7.5).text('Category: ', left + 355, vehBodyTop + 20, { width: 45 });
  doc.font('Helvetica').fontSize(7.5).text(data.vehicle.category || 'Second-hand Heavy Equipment', left + 402, vehBodyTop + 20, { width: 115, lineBreak: false, ellipsis: true });

  // 7. Line Items & Tax Breakdown Table
  // Total width: 523
  // Columns: Sl(20), Description(195), HSN(35), Taxable(65), Rate(30), CGST(45), SGST(45), IGST(43), Total(45) = 523
  const itemsTop = vehBodyTop + vehBodyH;
  const itemHdrH = 20;

  const colSl = left + 20;
  const colDesc = colSl;
  const colHsn = left + 215;
  const colTaxable = left + 250;
  const colRate = left + 315;
  const colCgst = left + 345;
  const colSgst = left + 390;
  const colIgst = left + 435;
  const colTotal = left + 478;

  doc.rect(left, itemsTop, width, itemHdrH).fillAndStroke(BG_HEADER, INK);
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, itemsTop).lineTo(x, itemsTop + itemHdrH).stroke(),
  );

  doc.font('Helvetica-Bold').fontSize(6.8).fillColor(INK);
  doc.text('Sl.', left + 2, itemsTop + 6, { width: 16, align: 'center' });
  doc.text('Description of Supply (Margin Scheme)', colDesc + 4, itemsTop + 6, { width: colHsn - colDesc - 8, align: 'center' });
  doc.text('HSN/SAC', colHsn + 2, itemsTop + 6, { width: colTaxable - colHsn - 4, align: 'center' });
  doc.text('Taxable Base', colTaxable + 2, itemsTop + 6, { width: colRate - colTaxable - 4, align: 'right' });
  doc.text('Rate', colRate + 1, itemsTop + 6, { width: colCgst - colRate - 2, align: 'center' });
  doc.text('CGST (9%)', colCgst + 2, itemsTop + 6, { width: colSgst - colCgst - 4, align: 'right' });
  doc.text('SGST (9%)', colSgst + 2, itemsTop + 6, { width: colIgst - colSgst - 4, align: 'right' });
  doc.text('IGST (18%)', colIgst + 2, itemsTop + 6, { width: colTotal - colIgst - 4, align: 'right' });
  doc.text('Total (Gross)', colTotal + 2, itemsTop + 6, { width: right - colTotal - 4, align: 'right' });

  // Items Area (Height 52 pt — plenty of room for 3 sequential lines, completely immune to overlap)
  const itemsAreaH = 52;
  const itemsAreaTop = itemsTop + itemHdrH;
  doc.rect(left, itemsAreaTop, width, itemsAreaH).stroke();
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, itemsAreaTop).lineTo(x, itemsAreaTop + itemsAreaH).stroke(),
  );

  const rowY = itemsAreaTop + 6;
  doc.font('Helvetica').fontSize(7.5).fillColor(INK);
  doc.text('1', left + 2, itemsAreaTop + 18, { width: 16, align: 'center' });

  // Description: 3 cleanly separated lines using dynamic doc.y + 2
  const descX = colDesc + 5;
  const descW = colHsn - colDesc - 10;
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text('Margin on supply of second-hand machinery', descX, rowY, {
      width: descW,
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(INK)
    .text(data.vehicle.title, descX, doc.y + 2, {
      width: descW,
      height: 12,
      lineBreak: false,
      ellipsis: true,
    });
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor(MUTED)
    .text(
      `Reg. No: ${data.vehicle.registrationNumber || 'N/A'}${data.vehicle.chassisNumber ? ` · Chassis: ${data.vehicle.chassisNumber}` : ''}`,
      descX,
      doc.y + 2,
      { width: descW, height: 11, lineBreak: false, ellipsis: true },
    );

  // HSN/SAC: '-' exactly as Bill of Supply
  const numY = itemsAreaTop + 18;
  doc.font('Helvetica').fontSize(7.5).fillColor(INK).text('-', colHsn + 2, numY, { width: colTaxable - colHsn - 4, align: 'center', lineBreak: false });

  // Numbers: strictly lineBreak: false to prevent 2-line overflow across row boundary
  doc.font('Helvetica').fontSize(7).text(rupeesText(data.finance.taxableValue), colTaxable + 2, numY, { width: colRate - colTaxable - 4, align: 'right', lineBreak: false });
  doc.text(`${data.finance.gstRatePercent}%`, colRate + 1, numY, { width: colCgst - colRate - 2, align: 'center', lineBreak: false });
  doc.text(data.finance.isIntraState ? rupeesText(data.finance.cgst) : '—', colCgst + 2, numY, { width: colSgst - colCgst - 4, align: 'right', lineBreak: false });
  doc.text(data.finance.isIntraState ? rupeesText(data.finance.sgst) : '—', colSgst + 2, numY, { width: colIgst - colSgst - 4, align: 'right', lineBreak: false });
  doc.text(!data.finance.isIntraState ? rupeesText(data.finance.igst) : '—', colIgst + 2, numY, { width: colTotal - colIgst - 4, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7).text(rupeesText(data.finance.totalInvoiceAmount), colTotal + 2, numY, { width: right - colTotal - 4, align: 'right', lineBreak: false });

  // Totals Row
  const totalRowH = 16;
  const totalRowTop = itemsAreaTop + itemsAreaH;
  doc.rect(left, totalRowTop, width, totalRowH).fillAndStroke(BG_HEADER, INK);
  [colSl, colHsn, colTaxable, colRate, colCgst, colSgst, colIgst, colTotal].forEach((x) =>
    doc.moveTo(x, totalRowTop).lineTo(x, totalRowTop + totalRowH).stroke(),
  );

  doc.font('Helvetica-Bold').fontSize(7).fillColor(INK);
  doc.text('Total', colDesc + 4, totalRowTop + 4.5, { width: colHsn - colDesc - 8, align: 'right' });
  doc.text('-', colHsn + 2, totalRowTop + 4.5, { width: colTaxable - colHsn - 4, align: 'center' });
  doc.text(rupeesText(data.finance.taxableValue), colTaxable + 2, totalRowTop + 4.5, { width: colRate - colTaxable - 4, align: 'right', lineBreak: false });
  doc.text('', colRate + 1, totalRowTop + 4.5, { width: colCgst - colRate - 2, align: 'center' });
  doc.text(data.finance.isIntraState ? rupeesText(data.finance.cgst) : '—', colCgst + 2, totalRowTop + 4.5, { width: colSgst - colCgst - 4, align: 'right', lineBreak: false });
  doc.text(data.finance.isIntraState ? rupeesText(data.finance.sgst) : '—', colSgst + 2, totalRowTop + 4.5, { width: colIgst - colSgst - 4, align: 'right', lineBreak: false });
  doc.text(!data.finance.isIntraState ? rupeesText(data.finance.igst) : '—', colIgst + 2, totalRowTop + 4.5, { width: colTotal - colIgst - 4, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7).text(rupeesText(data.finance.totalInvoiceAmount), colTotal + 2, totalRowTop + 4.5, { width: right - colTotal - 4, align: 'right', lineBreak: false });

  // 8. Amount in Words Box
  const wordsH = 16;
  const wordsTop = totalRowTop + totalRowH;
  doc.rect(left, wordsTop, width, wordsH).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text('Total Invoice Amount in Words: ', left + 6, wordsTop + 4, { continued: true })
    .font('Helvetica')
    .text(data.amountInWords);

  // 9. Remarks & Profit Margin Computation Notes (Bullet points)
  const remarksH = 104;
  const remarksTop = wordsTop + wordsH;
  doc.rect(left, remarksTop, width, remarksH).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text('Profit Margin Computation & GST Accounting Notes (Rule 32(5), CGST Rules 2017):', left + 6, remarksTop + 5);

  let bulletY = remarksTop + 16;
  doc.font('Helvetica').fontSize(6.8).fillColor(INK);
  data.remarksBullets.forEach((bullet) => {
    doc.text(bullet, left + 8, bulletY, { width: width - 16, lineBreak: false });
    bulletY += 9.5;
  });

  // 10. Declaration & Signatory Box (Completely separate, zero overlap)
  const bottomBoxH = 70;
  const bottomBoxTop = remarksTop + remarksH;
  const signSplit = left + 270;
  doc.rect(left, bottomBoxTop, width, bottomBoxH).stroke();
  doc.moveTo(signSplit, bottomBoxTop).lineTo(signSplit, bottomBoxTop + bottomBoxH).stroke();

  // Left: Declaration (Clear, concise, no overlap with stamp text)
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

  // Right: Signatory (Identical to Bill of Supply)
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
