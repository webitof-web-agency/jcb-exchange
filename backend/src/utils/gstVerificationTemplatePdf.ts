import PDFDocument from 'pdfkit';

type GstVerificationTemplateInput = {
  gstin?: string | null;
  maskedGstin?: string | null;
  businessName?: string | null;
  legalName?: string | null;
  gstinStatus?: string | null;
  provider?: string | null;
  completedAt?: Date | string | null;
};

const text = (value: unknown, fallback = '-') => {
  const normalized = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  return normalized || fallback;
};

const dateText = (value: Date | string | null | undefined) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

/**
 * Generates the same kind of downloadable verification report used by the GST
 * preview. It is intentionally branded as a JCB Exchange verification report,
 * not as a government-issued certificate.
 */
export const buildGstVerificationTemplatePdf = (input: GstVerificationTemplateInput) => new Promise<Buffer>((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'JCB Exchange GST Verification Report' } });
  const chunks: Buffer[] = [];

  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  document.once('error', reject);
  document.once('end', () => resolve(Buffer.concat(chunks)));

  document
    .fillColor('#111827')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('JCB EXCHANGE', { align: 'center' })
    .moveDown(0.35)
    .fontSize(15)
    .text('GST Verification Report', { align: 'center' })
    .moveDown(0.2)
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748b')
    .text('Generated from the successful GST verification response for internal KYC review.', { align: 'center' });

  document.moveDown(1.2);
  document.roundedRect(48, document.y, 499, 42, 6).fillAndStroke('#ecfdf5', '#a7f3d0');
  document.fillColor('#047857').font('Helvetica-Bold').fontSize(11).text('VERIFICATION STATUS: SUCCESS', 64, document.y + 14);
  document.moveDown(2.4);

  const rows: Array<[string, string]> = [
    ['GSTIN', text(input.gstin || input.maskedGstin)],
    ['Legal name', text(input.legalName)],
    ['Trade / business name', text(input.businessName)],
    ['GSTIN status', text(input.gstinStatus)],
    ['Verification provider', text(input.provider, 'SUREPASS')],
    ['Verified on', dateText(input.completedAt)],
  ];

  document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('Verified business details');
  document.moveDown(0.45);
  rows.forEach(([label, value], index) => {
    const y = document.y;
    document.rect(48, y, 499, 30).fillAndStroke(index % 2 === 0 ? '#f8fafc' : '#ffffff', '#e2e8f0');
    document.fillColor('#64748b').font('Helvetica').fontSize(9).text(label, 62, y + 10, { width: 150 });
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(value, 220, y + 9, { width: 310 });
    document.y = y + 30;
  });

  document.moveDown(1.25);
  document.fillColor('#475569').font('Helvetica').fontSize(8.5).text(
    'This report is a digitally generated JCB Exchange KYC record. It is not a replacement for the GST portal certificate.',
    { align: 'left', lineGap: 3 },
  );
  document.moveDown(0.5);
  document.fillColor('#94a3b8').fontSize(8).text('Keep this document private and use it only for authorized verification review.');
  document.end();
});
