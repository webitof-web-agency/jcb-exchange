import PDFDocument from 'pdfkit';
import { numberToWordsInr } from './customerPrimeInvoice';

// One-page vouchers of a Sold Vehicle that have no DOCX template: the refund advice and the
// credit note issued when a sale with a Bill of Supply is cancelled.

export type SellAccountVoucherPdfData = {
  title: string;
  subtitle?: string;
  number: string;
  date: Date;
  company: { name: string; addressLine: string; gstin?: string | null; cin?: string | null };
  party: { label: string; name: string; mobile?: string | null; place?: string | null };
  vehicle: { title: string; registrationNumber?: string | null; chassisNumber?: string | null; recordNumber: string };
  details: Array<[string, string]>;
  amountLabel: string;
  amount: number;
  narration: string;
  signatory: { name: string; designation: string };
};

const rupees = (value: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: Date) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(value);

const ACCENT = '#1E3A8A';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';

export const renderSellAccountVoucherPdf = async (data: SellAccountVoucherPdfData, logoBuffer?: Buffer | null): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `${data.title} ${data.number}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 36;
    const width = 523;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, 32, { fit: [110, 46] });
      } catch {
        // Branding must never block the document.
      }
    }
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(data.company.name, left, 34, { width, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(data.company.addressLine, left + 120, doc.y + 2, { width: width - 240, align: 'center' });
    const ids = [data.company.cin ? `CIN: ${data.company.cin}` : '', data.company.gstin ? `GSTIN: ${data.company.gstin}` : ''].filter(Boolean).join('   ');
    if (ids) doc.text(ids, left, doc.y + 1, { width, align: 'center' });

    let y = Math.max(doc.y, 80) + 10;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text(data.title, left, y, { width, align: 'center', underline: true });
    if (data.subtitle) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(data.subtitle, left, doc.y + 2, { width, align: 'center' });
    y = doc.y + 12;

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827');
    doc.text(`NO : ${data.number}`, left, y, { width: width / 2 });
    doc.text(`DATE : ${formatDate(data.date).toUpperCase()}`, left + width / 2, y, { width: width / 2, align: 'right' });
    y += 18;
    doc.moveTo(left, y).lineTo(left + width, y).dash(2, { space: 2 }).strokeColor(BORDER).stroke().undash();
    y += 8;

    const field = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, left, y, { width: 150 });
      doc.font('Helvetica-Bold').fillColor('#111827').text(value || '-', left + 150, y, { width: width - 150 });
      y = doc.y + 6;
    };
    field(data.party.label, data.party.name);
    if (data.party.mobile) field('MOBILE', data.party.mobile);
    if (data.party.place) field('PLACE', data.party.place);
    field('VEHICLE', [data.vehicle.title, data.vehicle.registrationNumber ? `Reg. No. ${data.vehicle.registrationNumber}` : '', data.vehicle.chassisNumber ? `Chassis No. ${data.vehicle.chassisNumber}` : ''].filter(Boolean).join(' · '));
    field('DEAL REF.', data.vehicle.recordNumber);
    data.details.forEach(([label, value]) => field(label, value));

    y += 4;
    doc.rect(left, y, width, 26).fillAndStroke('#F9FAFB', BORDER);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(data.amountLabel, left + 10, y + 8, { width: 300 });
    doc.text(rupees(data.amount), left + width - 190, y + 8, { width: 180, align: 'right' });
    y += 34;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`${numberToWordsInr(data.amount)}`.toUpperCase(), left, y, { width });
    y = doc.y + 10;
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`REMARKS : ${data.narration}`, left, y, { width, lineGap: 2 });
    y = doc.y + 40;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`FOR, ${data.company.name}`, left + width - 250, y, { width: 250, align: 'right' });
    y += 46;
    doc.font('Helvetica-Bold').fontSize(8.5).text("RECEIVER'S SIGNATURE", left, y, { width: 200 });
    doc.text(`AUTHORISED SIGNATORY: ${data.signatory.name} (${data.signatory.designation})`, left + width - 300, y, { width: 300, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#111827').lineWidth(0.8).stroke();

    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
      `Computer generated · ${data.number}`,
      left,
      doc.page.height - doc.page.margins.bottom - 14,
      { width, align: 'center', lineBreak: false },
    );
    doc.end();
  });
