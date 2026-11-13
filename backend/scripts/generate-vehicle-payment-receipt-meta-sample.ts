import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const outputPath = path.resolve(process.cwd(), '..', 'docs', 'vehicle-sale-payment-receipt-meta-sample.pdf');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
  Title: 'JCB Exchange Vehicle Payment Receipt Sample',
  Author: 'JCB Exchange',
  Subject: 'WhatsApp Document Header Sample',
} });
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

doc.fillColor('#111827').fontSize(20).font('Helvetica-Bold').text('JCB EXCHANGE', { align: 'center' });
doc.moveDown(0.25).fontSize(10).font('Helvetica').fillColor('#4b5563').text('VEHICLE PAYMENT RECEIPT', { align: 'center' });
doc.moveDown(1).strokeColor('#d1d5db').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
doc.moveDown(1);

const row = (label: string, value: string) => {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(label, 64, doc.y, { continued: true, width: 150 });
  doc.font('Helvetica').fillColor('#111827').text(value, { width: 330 });
  doc.moveDown(0.35);
};

row('Receipt number', 'JCB/RAIPUR/SAL/26-27/0001');
row('Receipt date', '12/NOV/2026');
row('Customer', 'Asha Gupta');
row('Vehicle', 'JCB 3DX 2019');
row('Amount received', 'Rs. 2,00,000.00');
row('Balance due', 'Rs. 10,00,000.00');
row('Payment method', 'UPI');

doc.moveDown(1).fillColor('#f3f4f6').roundedRect(48, doc.y, 499, 58, 6).fill();
doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Payment received: Rs. 2,00,000.00', 64, doc.y + 14);
doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text('Customer balance: Rs. 10,00,000.00', 64, doc.y + 33);
doc.y += 85;

doc.fillColor('#374151').fontSize(9).font('Helvetica').text('This sample PDF is uploaded to Meta only as the Document Header example. The application generates the actual branded Money Receipt PDF for each customer payment.');
doc.moveDown(2).fontSize(10).fillColor('#111827').text('Thank you for choosing JCB Exchange.', { align: 'center' });
doc.end();

stream.on('finish', () => console.log(`Created ${outputPath}`));
