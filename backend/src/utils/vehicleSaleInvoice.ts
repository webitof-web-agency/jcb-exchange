import PDFDocument from 'pdfkit';
import type { CompanyInvoiceSettings } from './appSettings';
import { numberToWordsInr } from './customerPrimeInvoice';

export type VehicleSaleInvoiceData = {
  company: Pick<CompanyInvoiceSettings, 'companyName' | 'gstin' | 'address' | 'city' | 'state' | 'termsAndConditions'>;
  invoiceNumber: string;
  invoiceDate: Date;
  recordNumber: string;
  customer: { name: string; mobile: string; city: string; state: string };
  vehicle: { title: string; brand: string; model: string; category: string; registrationNumber: string; chassisNumber: string };
  saleType: 'SELL' | 'EXCHANGE';
  saleAmount: number;
  exchangeVehicle: string;
  exchangeValue: number;
  amountReceived: number;
};

/** Indian financial year label (April-March), e.g. 2026-27. */
export const financialYearLabel = (date: Date) => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export const vehicleSaleInvoicePrefix = (date: Date) => `JCBX/SV/${financialYearLabel(date)}/`;

export const nextVehicleSaleInvoiceNumber = (date: Date, existingNumbers: string[]) => {
  const prefix = vehicleSaleInvoicePrefix(date);
  const highest = existingNumbers.reduce((max, number) => {
    if (!number.startsWith(prefix)) return max;
    const sequence = Number.parseInt(number.slice(prefix.length), 10);
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
};

const rupees = (value: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: Date) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(value);

const AMBER = '#B45309';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';

export const renderVehicleSaleInvoicePdf = async (
  invoice: VehicleSaleInvoiceData,
  logoBuffer?: Buffer | null,
): Promise<Buffer> => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: `Invoice ${invoice.invoiceNumber}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const left = 36;
  const width = 523;
  const companyName = invoice.company.companyName || 'JCB Exchange';

  // Header
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, left, 32, { fit: [110, 46] });
    } catch {
      // Branding must never block the invoice.
    }
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('TAX INVOICE', left, 36, { width, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Second-hand goods · Margin scheme (Rule 32(5), CGST Rules 2017)', left, 56, { width, align: 'right' });

  let y = 92;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(AMBER).lineWidth(1.5).stroke();
  y += 10;

  // Seller + invoice meta
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(companyName, left, y);
  doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
  doc.text(invoice.company.address || '', left, y + 15, { width: 280 });
  doc.text([invoice.company.city, invoice.company.state].filter(Boolean).join(', '), left, doc.y + 1, { width: 280 });
  doc.text(`GSTIN: ${invoice.company.gstin || 'Not configured'}`, left, doc.y + 1, { width: 280 });

  const metaX = 340;
  const meta: Array<[string, string]> = [
    ['Invoice No.', invoice.invoiceNumber],
    ['Invoice Date', formatDate(invoice.invoiceDate)],
    ['Deal Ref.', invoice.recordNumber],
    ['Place of Supply', invoice.customer.state || '—'],
  ];
  meta.forEach(([label, value], index) => {
    const rowY = y + index * 15;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, metaX, rowY, { width: 80 });
    doc.font('Helvetica-Bold').fillColor('#111827').text(value, metaX + 82, rowY, { width: width - (metaX - left) - 82 });
  });

  y = Math.max(doc.y, y + 64) + 14;

  // Bill to + vehicle
  const boxHeight = 92;
  doc.roundedRect(left, y, 255, boxHeight, 4).strokeColor(BORDER).lineWidth(0.8).stroke();
  doc.roundedRect(left + 268, y, 255, boxHeight, 4).strokeColor(BORDER).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(AMBER).text('BILLED TO', left + 10, y + 9);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text(invoice.customer.name || 'Customer', left + 10, y + 23, { width: 235 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
  if (invoice.customer.mobile) doc.text(`Mobile: ${invoice.customer.mobile}`, left + 10, doc.y + 3, { width: 235 });
  const customerPlace = [invoice.customer.city, invoice.customer.state].filter(Boolean).join(', ');
  if (customerPlace) doc.text(customerPlace, left + 10, doc.y + 2, { width: 235 });

  const vx = left + 278;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(AMBER).text('VEHICLE', vx, y + 9);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text(invoice.vehicle.title || [invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' '), vx, y + 23, { width: 235 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
  doc.text(`Registration No.: ${invoice.vehicle.registrationNumber || '—'}`, vx, doc.y + 3, { width: 235 });
  doc.text(`Chassis No.: ${invoice.vehicle.chassisNumber || '—'}`, vx, doc.y + 2, { width: 235 });
  doc.text(`Category: ${invoice.vehicle.category || '—'}`, vx, doc.y + 2, { width: 235 });

  y += boxHeight + 18;

  // Line items
  const colAmountX = left + width - 130;
  doc.rect(left, y, width, 22).fillAndStroke('#F9FAFB', BORDER);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827');
  doc.text('#', left + 8, y + 7, { width: 20 });
  doc.text('Description', left + 32, y + 7, { width: 330 });
  doc.text('Amount', colAmountX, y + 7, { width: 122, align: 'right' });
  y += 22;

  const rows: Array<[string, number]> = [
    [`Sale of used ${invoice.vehicle.category || 'vehicle'} — ${[invoice.vehicle.brand, invoice.vehicle.model].filter(Boolean).join(' ')} (Reg. ${invoice.vehicle.registrationNumber || 'N/A'})`, invoice.saleAmount],
  ];
  if (invoice.saleType === 'EXCHANGE' && invoice.exchangeValue > 0) {
    rows.push([`Less: vehicle taken in exchange${invoice.exchangeVehicle ? ` — ${invoice.exchangeVehicle}` : ''}`, -invoice.exchangeValue]);
  }
  rows.forEach(([description, amount], index) => {
    doc.rect(left, y, width, 26).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
    doc.text(String(index + 1), left + 8, y + 9, { width: 20 });
    doc.text(description, left + 32, y + 9, { width: 330 });
    doc.text(amount < 0 ? `- ${rupees(Math.abs(amount))}` : rupees(amount), colAmountX, y + 9, { width: 122, align: 'right' });
    y += 26;
  });

  const netPayable = Math.max(invoice.saleAmount - (invoice.saleType === 'EXCHANGE' ? invoice.exchangeValue : 0), 0);
  const balance = Math.max(netPayable - invoice.amountReceived, 0);
  const totals: Array<[string, string, boolean]> = [
    ['Invoice value', rupees(invoice.saleAmount), false],
    ...(invoice.saleType === 'EXCHANGE' && invoice.exchangeValue > 0 ? [['Net payable after exchange', rupees(netPayable), false] as [string, string, boolean]] : []),
    ['Amount received', rupees(invoice.amountReceived), false],
    ['Balance due', rupees(balance), true],
  ];
  y += 8;
  totals.forEach(([label, value, strong]) => {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 10 : 8.5).fillColor(strong ? '#111827' : '#374151');
    doc.text(label, colAmountX - 170, y, { width: 165, align: 'right' });
    doc.text(value, colAmountX, y, { width: 122, align: 'right' });
    y += strong ? 18 : 14;
  });

  y += 6;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text('Amount in words: ', left, y, { continued: true });
  doc.font('Helvetica').text(numberToWordsInr(invoice.saleAmount));
  y = doc.y + 12;

  doc.roundedRect(left, y, width, 40, 4).fillAndStroke('#FFFBEB', '#FCD34D');
  doc.fillColor('#78350F').font('Helvetica').fontSize(8).text(
    'GST is paid by the dealer on the margin under Rule 32(5) of the CGST Rules, 2017 (second-hand goods). '
      + 'Tax is not charged separately on this invoice and input tax credit is not admissible to the buyer.',
    left + 10,
    y + 9,
    { width: width - 20, lineGap: 2 },
  );
  y += 54;

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text('Terms & Conditions', left, y);
  doc.font('Helvetica').fontSize(8).fillColor('#374151').text(
    invoice.company.termsAndConditions || 'This is a computer-generated invoice and does not require a physical signature.',
    left,
    y + 13,
    { width: 330, lineGap: 2 },
  );
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text(`For ${companyName}`, left + 360, y, { width: 163, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Authorised Signatory', left + 360, y + 46, { width: 163, align: 'right' });

  // Stay above the bottom margin, otherwise pdfkit silently starts a blank second page.
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
    `Generated on ${formatDate(new Date())} · ${invoice.invoiceNumber}`,
    left,
    doc.page.height - doc.page.margins.bottom - 14,
    { width, align: 'center', lineBreak: false },
  );
  doc.end();
});
