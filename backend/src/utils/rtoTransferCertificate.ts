import PDFDocument from 'pdfkit';

export type RtoTransferCertificateData = {
  companyName: string;
  companyAddress: string;
  vehicle: { registrationNumber: string; brand: string; model: string; category: string; chassisNumber: string };
  previousOwner: { name: string; mobile: string };
  newOwner: { name: string; mobile: string };
  rtoOffice: string;
  rtoAgent: string;
  dealReference: string;
  tasks: Array<{ label: string; status: string; remark: string; updatedAt: Date | string; optional: boolean }>;
  completedAt: Date;
};

const STATUS_LABELS: Record<string, string> = {
  TRANSFERRED: 'Transferred',
  NOT_REQUIRED: 'Not Required',
};

const formatDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const AMBER = '#B45309';
const BORDER = '#D1D5DB';
const MUTED = '#6B7280';

/**
 * Internal completion summary of the ownership-transfer checklist. It is deliberately
 * labelled as a JCB Exchange document and is not a substitute for the RTO-issued RC.
 */
export const renderRtoTransferCertificatePdf = async (data: RtoTransferCertificateData): Promise<Buffer> => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Ownership transfer — ${data.vehicle.registrationNumber}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const left = 36;
  const width = 523;

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text('OWNERSHIP TRANSFER COMPLETION', left, 38, { width });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`${data.companyName}${data.companyAddress ? ` · ${data.companyAddress}` : ''}`, left, 58, { width });
  let y = 78;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(AMBER).lineWidth(1.5).stroke();
  y += 14;

  const grid: Array<[string, string]> = [
    ['Registration No.', data.vehicle.registrationNumber || '—'],
    ['Vehicle', [data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' ') || '—'],
    ['Category', data.vehicle.category || '—'],
    ['Chassis No.', data.vehicle.chassisNumber || '—'],
    ['Previous owner', [data.previousOwner.name, data.previousOwner.mobile].filter(Boolean).join(' · ') || '—'],
    ['New owner', [data.newOwner.name, data.newOwner.mobile].filter(Boolean).join(' · ') || '—'],
    ['RTO office', data.rtoOffice || '—'],
    ['RTO agent', data.rtoAgent || '—'],
    ['Deal reference', data.dealReference || '—'],
    ['Completed on', formatDate(data.completedAt)],
  ];
  grid.forEach(([label, value], index) => {
    const column = index % 2;
    const rowY = y + Math.floor(index / 2) * 30;
    const x = left + column * 268;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, rowY, { width: 255 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(value, x, rowY + 10, { width: 255, ellipsis: true, height: 13 });
  });
  y += Math.ceil(grid.length / 2) * 30 + 10;

  doc.rect(left, y, width, 22).fillAndStroke('#F9FAFB', BORDER);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827');
  doc.text('Checklist item', left + 8, y + 7, { width: 150 });
  doc.text('Status', left + 165, y + 7, { width: 80 });
  doc.text('Last remark', left + 250, y + 7, { width: 200 });
  doc.text('Updated', left + 455, y + 7, { width: 60, align: 'right' });
  y += 22;

  for (const task of data.tasks) {
    const remarkHeight = doc.font('Helvetica').fontSize(8).heightOfString(task.remark || '—', { width: 200 });
    const rowHeight = Math.max(24, remarkHeight + 12);
    doc.rect(left, y, width, rowHeight).strokeColor(BORDER).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111827').text(`${task.label}${task.optional ? ' (optional)' : ''}`, left + 8, y + 7, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(task.status === 'TRANSFERRED' ? '#047857' : MUTED)
      .text(STATUS_LABELS[task.status] || task.status, left + 165, y + 7, { width: 80 });
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(task.remark || '—', left + 250, y + 7, { width: 200 });
    doc.text(formatDate(task.updatedAt), left + 455, y + 7, { width: 60, align: 'right' });
    y += rowHeight;
  }

  y += 16;
  doc.roundedRect(left, y, width, 38, 4).fillAndStroke('#F3F4F6', BORDER);
  doc.fillColor('#374151').font('Helvetica').fontSize(8).text(
    'This is an internal JCB Exchange summary of the ownership-transfer work. It is not a Registration Certificate; '
      + 'the RC issued by the Regional Transport Office remains the legal proof of ownership.',
    left + 10,
    y + 9,
    { width: width - 20, lineGap: 2 },
  );

  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
    `Generated on ${formatDate(new Date())}`,
    left,
    doc.page.height - doc.page.margins.bottom - 14,
    { width, align: 'center', lineBreak: false },
  );
  doc.end();
});
