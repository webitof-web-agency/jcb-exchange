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
const ACCENT_LIGHT = '#EFF6FF';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';
const INK = '#111827';

/**
 * Industry-standard header: accent bar → header bg with logo left + company info right of logo.
 * Returns the y-position below the header block.
 */
const drawCompanyHeader = (
  doc: PDFKit.PDFDocument,
  company: { name: string; addressLine: string; gstin?: string | null; cin?: string | null },
  logoBuffer: Buffer | null | undefined,
  left: number,
  width: number,
  startY = 32,
): number => {
  const logoW = 90;
  const logoH = 46;
  const headerH = 70;

  // Accent top bar (4 px navy stripe)
  doc.rect(left, startY, width, 4).fill(ACCENT);

  // Header background (light blue panel)
  doc.rect(left, startY + 4, width, headerH).fillAndStroke(ACCENT_LIGHT, '#BFDBFE');

  // Logo — left side, vertically centred
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, left + 10, startY + 4 + (headerH - logoH) / 2, { fit: [logoW, logoH] });
    } catch {
      // Unsupported format — skip silently
    }
  }

  // Company name + details right of logo
  const textX = left + logoW + 20;
  const textW = width - logoW - 24;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(company.name.toUpperCase(), textX, startY + 14, { width: textW, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor('#374151')
    .text(company.addressLine, textX, doc.y + 2, { width: textW, align: 'center' });
  const ids = [
    company.cin ? `CIN: ${company.cin}` : '',
    company.gstin ? `GSTIN: ${company.gstin}` : '',
  ].filter(Boolean).join('   ');
  if (ids) {
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(ids, textX, doc.y + 2, { width: textW, align: 'center' });
  }

  return startY + 4 + headerH + 6; // bottom of header + small gap
};

export const renderSellAccountVoucherPdf = async (data: SellAccountVoucherPdfData, logoBuffer?: Buffer | null): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `${data.title} ${data.number}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 36;
    const width = 523;

    // ── Company Header ────────────────────────────────────────────────────────
    let y = drawCompanyHeader(doc, data.company, logoBuffer, left, width, 32);

    // ── Document Title ────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT)
      .text(data.title, left, y, { width, align: 'center', underline: true });
    if (data.subtitle) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(data.subtitle, left, doc.y + 2, { width, align: 'center' });
    }
    y = doc.y + 12;

    // ── Number + Date ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
    doc.text(`NO : ${data.number}`, left, y, { width: width / 2 });
    doc.text(`DATE : ${formatDate(data.date).toUpperCase()}`, left + width / 2, y, { width: width / 2, align: 'right' });
    y += 18;
    doc.moveTo(left, y).lineTo(left + width, y).dash(2, { space: 2 }).strokeColor(BORDER).stroke().undash();
    y += 8;

    // ── Fields ────────────────────────────────────────────────────────────────
    const field = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, left, y, { width: 150 });
      doc.font('Helvetica-Bold').fillColor(INK).text(value || '-', left + 150, y, { width: width - 150 });
      y = doc.y + 6;
    };
    field(data.party.label, data.party.name);
    if (data.party.mobile) field('MOBILE', data.party.mobile);
    if (data.party.place) field('PLACE', data.party.place);
    field(
      'VEHICLE',
      [
        data.vehicle.title,
        data.vehicle.registrationNumber ? `Reg. No. ${data.vehicle.registrationNumber}` : '',
        data.vehicle.chassisNumber ? `Chassis No. ${data.vehicle.chassisNumber}` : '',
      ].filter(Boolean).join(' · '),
    );
    field('DEAL REF.', data.vehicle.recordNumber);
    data.details.forEach(([label, value]) => field(label, value));

    // ── Amount Box ────────────────────────────────────────────────────────────
    y += 4;
    doc.rect(left, y, width, 26).fillAndStroke('#F0F9FF', '#BFDBFE');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(data.amountLabel, left + 10, y + 8, { width: 300 });
    doc.text(rupees(data.amount), left + width - 190, y + 8, { width: 180, align: 'right' });
    y += 34;

    // ── Amount in Words + Narration ───────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(`${numberToWordsInr(data.amount)}`.toUpperCase(), left, y, { width });
    y = doc.y + 10;
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text(`REMARKS : ${data.narration}`, left, y, { width, lineGap: 2 });
    y = doc.y + 40;

    // ── Signature Block ───────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(`FOR, ${data.company.name}`, left + width - 250, y, { width: 250, align: 'right' });
    y += 46;
    doc.font('Helvetica-Bold').fontSize(8.5)
      .text("RECEIVER'S SIGNATURE", left, y, { width: 200 });
    doc.text(
      `AUTHORISED SIGNATORY: ${data.signatory.name} (${data.signatory.designation})`,
      left + width - 300, y, { width: 300, align: 'right' },
    );
    y += 14;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(0.8).stroke();

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
      `Computer generated · ${data.number}`,
      left,
      doc.page.height - doc.page.margins.bottom - 14,
      { width, align: 'center', lineBreak: false },
    );
    doc.end();
  });
