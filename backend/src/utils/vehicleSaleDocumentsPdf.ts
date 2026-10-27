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
const MUTED = '#4B5563';
const RULE = '#9CA3AF';

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

const drawLogo = (doc: PDFKit.PDFDocument, logo: Buffer | null | undefined, x: number, y: number) => {
  if (!logo) return;
  try {
    doc.image(logo, x, y, { fit: [90, 46] });
  } catch {
    // Unsupported logo formats (SVG/WebP) are skipped; the document still renders.
  }
};

const dottedRule = (doc: PDFKit.PDFDocument, x: number, y: number, width: number) => {
  doc.moveTo(x, y).lineTo(x + width, y).dash(1.5, { space: 2 }).strokeColor(RULE).lineWidth(0.7).stroke().undash();
};

export const renderMoneyReceiptPdf = async (data: MoneyReceiptPdfData, logo?: Buffer | null) => {
  const { doc, done } = startDocument(`Money Receipt ${data.receiptNumber}`);
  const left = 36;
  const width = 523;

  drawLogo(doc, logo, left + width - 90, 32);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(data.company.name.toUpperCase(), left, 36, { width, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(data.company.addressLine, left + 100, doc.y + 2, { width: width - 200, align: 'center' });
  const ids = [data.company.cin ? `CIN: ${data.company.cin}` : '', data.company.gstin ? `GSTIN: ${data.company.gstin}` : ''].filter(Boolean).join('   ');
  if (ids) doc.text(ids, left + 100, doc.y + 1, { width: width - 200, align: 'center' });

  let y = Math.max(doc.y, 84) + 12;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(data.title, left, y, { width, align: 'center', underline: true });
  y = doc.y + 14;

  doc.font('Helvetica-Bold').fontSize(9.5);
  doc.text(`RECEIPT NO : ${data.receiptNumber}`, left, y, { width: width * 0.65 });
  doc.text(`DATE : ${data.receiptDate}`, left + width * 0.65, y, { width: width * 0.35, align: 'right' });
  y += 16;
  dottedRule(doc, left, y, width);
  y += 7;
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text(`MODEL : ${data.vehicleTitle}`, left, y, { width: width * 0.5 });
  doc.text(`CUSTOMER ID : ${data.customerId}`, left + width * 0.5, y, { width: width * 0.5, align: 'right' });
  y = doc.y + 7;
  dottedRule(doc, left, y, width);
  y += 7;
  doc.text('RECEIVED WITH THANKS FROM', left, y, { width: 170 });
  doc.text(`: ${data.customerName.toUpperCase()}`, left + 170, y, { width: width - 170 });
  y = doc.y + 4;
  doc.text('PLACE', left, y, { width: 170 });
  doc.text(`: ${data.place.toUpperCase()}`, left + 170, y, { width: width - 170 });
  y = doc.y + 7;
  dottedRule(doc, left, y, width);
  y += 7;

  const columns: Array<[string, number, 'left' | 'right']> = [['MODE', 0, 'left'], ['TXN NO.', 0.18, 'left'], ['DATED', 0.38, 'left'], ['DRAWN ON', 0.56, 'left'], ['AMOUNT', 0.78, 'right']];
  const row = (values: string[]) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    columns.forEach(([, offset, align], index) => {
      const next = columns[index + 1]?.[1] ?? 1;
      doc.text(values[index] || '-', left + width * offset, y, { width: width * (next - offset) - 4, align });
    });
  };
  row(columns.map(([label]) => label));
  y += 14;
  dottedRule(doc, left, y, width);
  y += 6;
  row([data.mode, data.txnNumber, data.txnDate, data.drawnOn, data.amount]);
  y += 24;
  doc.font('Helvetica-Bold').fontSize(9).text(data.amountInWords.toUpperCase(), left, y, { width });
  y = doc.y + 10;
  dottedRule(doc, left, y, width);
  y += 7;
  doc.font('Helvetica-Bold').fontSize(8.5).text(`REMARKS : ${data.remarks.toUpperCase()}`, left, y, { width, lineGap: 2 });
  y = doc.y + 18;
  doc.text(`FOR, ${data.company.name.toUpperCase()}`, left + width - 260, y, { width: 260, align: 'right' });
  y += 52;
  doc.text("CUSTOMER'S SIGNATURE", left, y, { width: 200 });
  doc.text('AUTHORISED SIGNATORY', left + width - 260, y, { width: 260, align: 'right' });
  const signatoryLine = data.signatory.name === data.signatory.designation ? '' : `${data.signatory.name} (${data.signatory.designation})`;
  if (signatoryLine) doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(signatoryLine, left + width - 260, y + 12, { width: 260, align: 'right' });
  y += 28;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(0.8).stroke();

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
