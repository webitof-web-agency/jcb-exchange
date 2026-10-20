export type CustomerPrimeInvoiceSettings = {
  companyName: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  city: string | null;
  defaultGstRate: number;
  termsAndConditions: string | null;
};

export type CustomerPrimeInvoicePayment = {
  id: string;
  memberName: string;
  planName: string;
  amount: number;
  submittedAt: string | Date;
  transactionRef?: string | null;
  customerEmail?: string | null;
  customerMobile?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
};

export type CustomerPrimeInvoiceData = {
  settings: CustomerPrimeInvoiceSettings;
  payment: CustomerPrimeInvoicePayment;
  invoiceNumber: string;
  formattedDate: string;
  totalAmount: number;
  gstRate: number;
  taxableValue: number;
  totalTax: number;
  isIntraState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export const buildCustomerPrimeInvoiceData = ({
  settings,
  payment,
}: {
  settings: CustomerPrimeInvoiceSettings;
  payment: CustomerPrimeInvoicePayment;
}): CustomerPrimeInvoiceData => {
  const totalAmount = Number(payment.amount || 0);
  const gstRate = settings.defaultGstRate || 18;
  const taxableValue = totalAmount > 0 ? totalAmount / (1 + gstRate / 100) : 0;
  const totalTax = totalAmount - taxableValue;
  const supplierState = (settings.state || 'Maharashtra').trim().toLowerCase();
  const customerState = (payment.customerState || 'Maharashtra').trim().toLowerCase();
  const isIntraState = !customerState || supplierState === customerState;
  const invoiceDate = new Date(payment.submittedAt);
  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(Number.isNaN(invoiceDate.getTime()) ? new Date() : invoiceDate);

  return {
    settings,
    payment,
    invoiceNumber: `INV-${payment.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    formattedDate,
    totalAmount,
    gstRate,
    taxableValue,
    totalTax,
    isIntraState,
    cgstAmount: isIntraState ? totalTax / 2 : 0,
    sgstAmount: isIntraState ? totalTax / 2 : 0,
    igstAmount: isIntraState ? 0 : totalTax,
  };
};

export const numberToWordsInr = (num: number): string => {
  const rounded = Math.round(num);
  if (rounded === 0) return 'Zero Rupees Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convertLessThanThousand = (value: number): string => {
    if (value === 0) return '';
    if (value < 20) return `${single[value]} `;
    if (value < 100) return `${tens[Math.floor(value / 10)]} ${value % 10 ? `${single[value % 10]} ` : ''}`;
    return `${single[Math.floor(value / 100)]} Hundred ${value % 100 ? convertLessThanThousand(value % 100) : ''}`;
  };

  let remaining = rounded;
  let result = '';
  if (Math.floor(remaining / 10000000) > 0) {
    result += `${convertLessThanThousand(Math.floor(remaining / 10000000))}Crore `;
    remaining %= 10000000;
  }
  if (Math.floor(remaining / 100000) > 0) {
    result += `${convertLessThanThousand(Math.floor(remaining / 100000))}Lakh `;
    remaining %= 100000;
  }
  if (Math.floor(remaining / 1000) > 0) {
    result += `${convertLessThanThousand(Math.floor(remaining / 1000))}Thousand `;
    remaining %= 1000;
  }
  if (remaining > 0) result += convertLessThanThousand(remaining);
  return `Rupees ${result.trim()} Only`;
};

const drawSection = (document: PDFKit.PDFDocument, title: string, y: number) => {
  document.font('Helvetica-Bold').fontSize(10).text(title, 30, y);
  document.moveTo(30, y + 15).lineTo(565, y + 15).strokeColor('#000000').stroke();
  return y + 25;
};

const drawLabelValue = (document: PDFKit.PDFDocument, label: string, value: string, x: number, y: number) => {
  document.font('Helvetica-Bold').text(`${label}: `, x, y, { continued: true });
  document.font('Helvetica').text(value || 'N/A');
};

export const renderCustomerPrimeInvoicePdf = async (
  invoice: CustomerPrimeInvoiceData,
  logoBuffer?: Buffer | null,
): Promise<Buffer> => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);

  document.font('Helvetica-Bold').fontSize(18).text('SUBSCRIPTION INVOICE', 30, 35);
  if (logoBuffer) {
    try {
      document.image(logoBuffer, 500, 30, { fit: [45, 45], align: 'right' });
    } catch {
      // A branding image must never prevent the paid invoice from being delivered.
    }
  }

  let y = 95;
  document.rect(30, y, 535, 78).stroke();
  y += 12;
  drawLabelValue(document, 'Invoice No', invoice.invoiceNumber, 42, y);
  drawLabelValue(document, 'Generated Date', invoice.formattedDate, 300, y);
  y += 18;
  drawLabelValue(document, 'GSTIN', invoice.settings.gstin || 'URP', 42, y);
  drawLabelValue(document, 'Generated By', 'System', 300, y);
  y += 18;
  drawLabelValue(document, 'Payment Status', 'PAID & VERIFIED', 42, y);
  drawLabelValue(document, 'Txn Ref', invoice.payment.transactionRef || 'N/A', 300, y);

  y = 205;
  y = drawSection(document, '2. ADDRESS DETAILS', y);
  document.rect(30, y, 535, 82).stroke();
  document.font('Helvetica-Bold').fillColor('#b45309').text('BILLED FROM (SUPPLIER)', 42, y + 12);
  document.text('BILLED TO (CUSTOMER)', 310, y + 12);
  document.fillColor('#000000').font('Helvetica-Bold').text(invoice.settings.companyName || 'JCB Exchange', 42, y + 32);
  document.font('Helvetica').text(invoice.settings.address || 'Address not configured', 42, y + 47, { width: 230 });
  document.text([invoice.settings.city, invoice.settings.state].filter(Boolean).join(', ') || 'Maharashtra', 42, y + 63);
  document.font('Helvetica-Bold').text(invoice.payment.memberName || 'Customer', 310, y + 32);
  document.font('Helvetica').text([invoice.payment.customerCity, invoice.payment.customerState || invoice.settings.state].filter(Boolean).join(', ') || 'Maharashtra', 310, y + 47);
  if (invoice.payment.customerMobile) document.text(`Mobile: ${invoice.payment.customerMobile}`, 310, y + 63);
  if (invoice.payment.customerEmail) document.text(`Email: ${invoice.payment.customerEmail}`, 310, y + 75, { width: 240 });

  y = 330;
  y = drawSection(document, '3. SERVICE DETAILS', y);
  document.rect(30, y, 535, 22).fillAndStroke('#F9FAFB', '#000000');
  document.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
  document.text('S.No', 40, y + 7, { width: 35, align: 'center' });
  document.text('Service Name & Desc.', 85, y + 7, { width: 270 });
  document.text('Taxable Amount Rs.', 360, y + 7, { width: 105, align: 'right' });
  document.text('Tax Rate', 480, y + 7, { width: 75, align: 'center' });
  y += 22;
  document.rect(30, y, 535, 28).stroke();
  document.font('Helvetica').text('1', 40, y + 9, { width: 35, align: 'center' });
  document.text(invoice.payment.planName || 'Prime Membership', 85, y + 9, { width: 270, characterSpacing: 0.1 });
  document.text(invoice.taxableValue.toFixed(2), 360, y + 9, { width: 105, align: 'right' });
  document.text(`${invoice.gstRate}%`, 480, y + 9, { width: 75, align: 'center' });
  y += 45;
  document.font('Helvetica-Bold').fontSize(8).text('Taxable Amount', 42, y);
  document.text('CGST', 150, y);
  document.text('SGST', 235, y);
  document.text('IGST', 320, y);
  document.text('Total Invoice Amount', 430, y);
  y += 16;
  document.font('Helvetica').text(invoice.taxableValue.toFixed(2), 42, y);
  document.text(invoice.cgstAmount.toFixed(2), 150, y);
  document.text(invoice.sgstAmount.toFixed(2), 235, y);
  document.text(invoice.igstAmount.toFixed(2), 320, y);
  document.font('Helvetica-Bold').text(invoice.totalAmount.toFixed(2), 430, y);

  y = 445;
  y = drawSection(document, '4. PAYMENT & CONDITIONS', y);
  drawLabelValue(document, 'Amount in Words', numberToWordsInr(invoice.totalAmount), 42, y);
  y += 28;
  document.font('Helvetica-Bold').text('Terms & Conditions:', 42, y);
  document.font('Helvetica').fontSize(8).text(
    invoice.settings.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.',
    42,
    y + 15,
    { width: 505, lineGap: 3 },
  );
  document.end();
});
import PDFDocument from 'pdfkit';
