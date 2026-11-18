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

export type DeliveryChallanPdfData = {
  company: Company;
  challanNumber: string;
  challanDate: string;
  sellerName: string;
  purchaserName: string;
  purchaserAddress: string;
  vehicleTitle: string;
  registrationNumber: string;
  chassisNumber: string;
  engineNumber: string;
  purpose: string;
  remarks: string;
  signatory: Signatory;
};

const INK = '#111827';
const MUTED = '#6B7280';
const RULE = '#9CA3AF';
const ACCENT = '#1E3A8A';   // Navy blue — JCB Exchange brand accent
const ACCENT_LIGHT = '#EFF6FF'; // Very light blue for header bg
const ORANGE = '#F5A800';

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
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
    info: { Title: `Bill of Supply ${data.invoiceNumber}` },
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

  // 1. Top Header Area (Logo left, Company right)
  const headerTop = 26;
  if (logo) {
    try {
      doc.image(logo, left, headerTop, { fit: [120, 52] });
    } catch {
      drawLogo(doc, logo, left, headerTop);
    }
  }

  // Company details right aligned
  const companyRightX = left + 140;
  const companyRightW = width - 140;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(data.company.name.toUpperCase(), companyRightX, headerTop + 4, { width: companyRightW, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(data.company.addressLine, companyRightX, doc.y + 2, { width: companyRightW, align: 'right', lineGap: 1 });
  if (data.company.gstin) {
    doc.text(`GSTIN: ${data.company.gstin}`, companyRightX, doc.y + 1, { width: companyRightW, align: 'right' });
  }

  // 2. Orange Separator Line
  const orangeY = Math.max(doc.y + 8, headerTop + 58);
  doc.rect(left, orangeY, width, 2).fill(ORANGE);

  // 3. BILL OF SUPPLY heading
  const titleY = orangeY + 6;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('BILL OF SUPPLY', left, titleY, { width, align: 'center' });

  // 4. Main Details Table
  const tableTop = titleY + 16;
  const colSplit = left + 265;
  doc.lineWidth(0.8).strokeColor(INK);

  // Seller Details Header & Invoice Details Header
  const secHdrH = 16;
  doc.rect(left, tableTop, 265, secHdrH).stroke();
  doc.rect(colSplit, tableTop, right - colSplit, secHdrH).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK)
    .text('Seller / Supplier Details', left + 6, tableTop + 4)
    .text('Invoice Details', colSplit + 6, tableTop + 4);

  // Seller Info (left) vs Invoice Info (right)
  const infoH = 68;
  const infoTop = tableTop + secHdrH;
  doc.rect(left, infoTop, 265, infoH).stroke();
  doc.rect(colSplit, infoTop, right - colSplit, infoH).stroke();

  // Left (Seller)
  let ly = infoTop + 5;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Name: ', left + 6, ly, { continued: true })
    .font('Helvetica').text(data.company.name);
  ly = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('Address: ', left + 6, ly, { continued: true })
    .font('Helvetica').text(data.company.addressLine, { width: 250, height: 24, ellipsis: true });
  ly = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('GSTIN: ', left + 6, ly, { continued: true })
    .font('Helvetica').text(data.company.gstin || '-');
  ly = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('State / Code: ', left + 6, ly, { continued: true })
    .font('Helvetica').text(data.company.state || data.placeOfSupply);

  // Right (Invoice)
  let ry = infoTop + 5;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Invoice No: ', colSplit + 6, ry, { continued: true })
    .font('Helvetica').text(data.invoiceNumber);
  ry = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('Invoice Date: ', colSplit + 6, ry, { continued: true })
    .font('Helvetica').text(data.invoiceDate);
  ry = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('Place of Supply: ', colSplit + 6, ry, { continued: true })
    .font('Helvetica').text(data.placeOfSupply);
  ry = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('Terms of Delivery: ', colSplit + 6, ry, { continued: true })
    .font('Helvetica').text(data.cancelled || '-');

  // 5. Buyer Box
  const buyerHdrH = 15;
  const buyerHdrTop = infoTop + infoH;
  doc.rect(left, buyerHdrTop, width, buyerHdrH).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Buyer (Bill to)', left + 6, buyerHdrTop + 3.5);

  const buyerBodyH = 48;
  const buyerBodyTop = buyerHdrTop + buyerHdrH;
  doc.rect(left, buyerBodyTop, width, buyerBodyH).stroke();
  let by = buyerBodyTop + 5;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Name: ', left + 6, by, { continued: true })
    .text(data.customerName);
  by = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('Address: ', left + 6, by, { continued: true })
    .font('Helvetica').text(data.customerAddressLine);
  by = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8).text('GSTIN: ', left + 6, by, { continued: true })
    .font('Helvetica').text('-');
  doc.font('Helvetica-Bold').fontSize(8).text('State / Code: ', left + 200, by, { continued: true })
    .font('Helvetica').text(data.customerStateCode);

  // 6. Items Table
  const itemsTop = buyerBodyTop + buyerBodyH;
  const colSl = left + 24;
  const colDesc = colSl;
  const colHsn = right - 165;
  const colQty = right - 130;
  const colRate = right - 68;
  const colAmount = right;

  const itemHdrH = 22;
  doc.rect(left, itemsTop, width, itemHdrH).stroke();
  [colSl, colHsn, colQty, colRate].forEach(x => doc.moveTo(x, itemsTop).lineTo(x, itemsTop + itemHdrH).stroke());

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
  doc.text('Sl.', left + 2, itemsTop + 6, { width: 20, align: 'center' });
  doc.text('Description of Goods / Services', colDesc + 4, itemsTop + 6, { width: colHsn - colDesc - 8, align: 'center' });
  doc.text('HSN/SAC', colHsn + 2, itemsTop + 6, { width: colQty - colHsn - 4, align: 'center' });
  doc.text('Qty.', colQty + 2, itemsTop + 6, { width: colRate - colQty - 4, align: 'center' });
  doc.text('Rate', colRate + 2, itemsTop + 6, { width: colAmount - colRate - 6, align: 'right' });
  doc.text('Amount', colRate + 2, itemsTop + 14, { width: colAmount - colRate - 6, align: 'right' });

  // Item Rows (Fixed container height so it fits on exactly 1 page)
  const itemsAreaH = 155;
  const itemsAreaTop = itemsTop + itemHdrH;
  doc.rect(left, itemsAreaTop, width, itemsAreaH).stroke();
  [colSl, colHsn, colQty, colRate].forEach(x => doc.moveTo(x, itemsAreaTop).lineTo(x, itemsAreaTop + itemsAreaH).stroke());

  // Item 1 Row
  const itemRowY = itemsAreaTop + 8;
  doc.font('Helvetica').fontSize(8.5).fillColor(INK);
  doc.text('1', left + 2, itemRowY, { width: 20, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(8.5).text(data.description, colDesc + 6, itemRowY, { width: colHsn - colDesc - 12 });
  doc.font('Helvetica').fontSize(8.5).text(data.hsn || '-', colHsn + 2, itemRowY, { width: colQty - colHsn - 4, align: 'center' });
  doc.text('1', colQty + 2, itemRowY, { width: colRate - colQty - 4, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(8.5).text(data.amount, colRate + 2, itemRowY, { width: colAmount - colRate - 6, align: 'right' });

  // Total Row
  const totalRowH = 18;
  const totalRowTop = itemsAreaTop + itemsAreaH;
  doc.rect(left, totalRowTop, width, totalRowH).stroke();
  doc.moveTo(colRate, totalRowTop).lineTo(colRate, totalRowTop + totalRowH).stroke();
  doc.font('Helvetica-Bold').fontSize(9).text('Total', colDesc + 4, totalRowTop + 4, { width: colRate - colDesc - 10, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9.5).text(data.total, colRate + 2, totalRowTop + 4, { width: colAmount - colRate - 6, align: 'right' });

  // 7. Amount in Words Box
  const wordsH = 18;
  const wordsTop = totalRowTop + totalRowH;
  doc.rect(left, wordsTop, width, wordsH).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Amount in Words: ', left + 6, wordsTop + 4, { continued: true })
    .font('Helvetica').text(data.amountInWords);

  // 8. Remarks Box
  const remarksH = 50;
  const remarksTop = wordsTop + wordsH;
  doc.rect(left, remarksTop, width, remarksH).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Remarks:', left + 6, remarksTop + 4);
  doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(data.remarks, left + 6, remarksTop + 14, { width: width - 12, lineGap: 1 });

  // 9. Declaration & Signatory Box
  const bottomBoxH = 68;
  const bottomBoxTop = remarksTop + remarksH;
  const signSplit = left + 270;
  doc.rect(left, bottomBoxTop, width, bottomBoxH).stroke();
  doc.moveTo(signSplit, bottomBoxTop).lineTo(signSplit, bottomBoxTop + bottomBoxH).stroke();

  // Left: Declaration
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('Declaration:', left + 6, bottomBoxTop + 5);
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', left + 6, bottomBoxTop + 16, { width: signSplit - left - 12, lineGap: 1.5 });

  // Right: Signatory
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(`For ${data.company.name.toUpperCase()}`, signSplit + 6, bottomBoxTop + 5, { width: right - signSplit - 12, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('Signature: __________________________', signSplit + 6, bottomBoxTop + 32, { width: right - signSplit - 12, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text(`Name: ${data.signatory.name}`, signSplit + 6, bottomBoxTop + 43, { width: right - signSplit - 12, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(`Designation: ${data.signatory.designation}`, signSplit + 6, bottomBoxTop + 53, { width: right - signSplit - 12, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text('(Company Seal / Stamp)', left + 6, bottomBoxTop + 53);

  // 10. Bottom Footer Line (Registered Office, Email, Mobile)
  const footerY = 800;
  doc.rect(left, footerY - 4, width, 1.5).fill(ORANGE);
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
    .text('Registered Office: SH No. 08, 1st Floor, Housing Board Complex, Khamhardih, Shanker Nagar, Raipur, Chhattisgarh - 492004', left, footerY + 2, { width, align: 'center' });
  doc.text('Email: arjun16081991@gmail.com   |   Mob: +91 91834 33895', left, footerY + 12, { width, align: 'center' });

  doc.end();
  return done;
};

/** Internal handover document. It is intentionally labelled a delivery challan, not a tax invoice. */
export const renderDeliveryChallanPdf = async (data: DeliveryChallanPdfData, logo?: Buffer | null) => {
  const { doc, done } = startDocument(`Delivery Challan ${data.challanNumber}`);
  const left = 40;
  const width = 515;
  let y = drawCompanyHeader(doc, data.company, logo, left, width, 32);

  doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text('DELIVERY CHALLAN', left, y, { width, align: 'center', underline: true });
  y = doc.y + 12;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`CHALLAN NO : ${data.challanNumber}`, left, y, { width: width * 0.6 });
  doc.text(`DATE : ${data.challanDate}`, left + width * 0.6, y, { width: width * 0.4, align: 'right' });
  y += 18;
  dottedRule(doc, left, y, width);
  y += 12;

  const field = (label: string, value: string, x: number, fieldWidth: number) => {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: fieldWidth });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(value || '-', x, y + 11, { width: fieldWidth, height: 14, ellipsis: true });
  };
  field('Seller / source', data.sellerName, left, width / 2 - 8);
  field('Customer / recipient', data.purchaserName, left + width / 2 + 8, width / 2 - 8);
  y += 42;
  field('Delivery address', data.purchaserAddress, left, width);
  y += 42;
  dottedRule(doc, left, y, width);
  y += 12;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('VEHICLE DETAILS', left, y);
  y += 20;
  const vehicleFields: Array<[string, string]> = [
    ['Description', data.vehicleTitle],
    ['Registration number', data.registrationNumber],
    ['Chassis number', data.chassisNumber],
    ['Engine number', data.engineNumber],
  ];
  vehicleFields.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = left + column * (width / 2 + 8);
    field(label, value, x, width / 2 - 16);
    if (column === 1) y += 38;
  });
  y += 32;
  dottedRule(doc, left, y, width);
  y += 14;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('PURPOSE', left, y);
  doc.font('Helvetica').fontSize(9).text(data.purpose || '-', left, y + 13, { width, lineGap: 2 });
  y = doc.y + 14;
  doc.font('Helvetica-Bold').fontSize(9).text('REMARKS', left, y);
  doc.font('Helvetica').fontSize(9).text(data.remarks || '-', left, y + 13, { width, lineGap: 2 });
  y = doc.y + 28;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(0.8).stroke();
  y += 26;
  doc.font('Helvetica-Bold').fontSize(9).text(`FOR, ${data.company.name.toUpperCase()}`, left + width - 260, y, { width: 260, align: 'right' });
  y += 48;
  doc.font('Helvetica').fontSize(8).text('Recipient signature', left, y, { width: 200 });
  doc.text(`AUTHORISED SIGNATORY: ${data.signatory.name} (${data.signatory.designation})`, left + width - 300, y, { width: 300, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('This document records vehicle handover and is not a tax invoice.', left, doc.page.height - doc.page.margins.bottom - 14, { width, align: 'center', lineBreak: false });
  doc.end();
  return done;
};
