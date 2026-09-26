"use client";

import React, { useEffect, useState } from 'react';
import { Download, X, FileText } from 'lucide-react';
import api, { getAbsoluteMediaUrl } from '@/lib/api';

const INVOICE_LOGO_FALLBACK = '/frontheadlogo.png';

type InvoiceSettings = {
  companyName: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  city: string | null;
  defaultGstRate: number;
  termsAndConditions: string | null;
};

export type InvoicePaymentData = {
  id: string;
  memberName: string;
  planName: string;
  amount: number;
  submittedAt: string;
  transactionRef?: string | null;
  customerEmail?: string | null;
  customerMobile?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
};

type TaxInvoiceModalProps = {
  isOpen: boolean;
  onClose: () => void;
  payment: InvoicePaymentData | null;
};



const numberToWordsInr = (num: number): string => {
  const rounded = Math.round(num);
  if (rounded === 0) return 'Zero Rupees Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return single[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? single[n % 10] + ' ' : '');
    return single[Math.floor(n / 100)] + ' Hundred ' + (n % 100 !== 0 ? convertLessThanThousand(n % 100) : '');
  };

  let n = rounded;
  let res = '';

  if (Math.floor(n / 10000000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 10000000)) + 'Crore ';
    n %= 10000000;
  }
  if (Math.floor(n / 100000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 100000)) + 'Lakh ';
    n %= 100000;
  }
  if (Math.floor(n / 1000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 1000)) + 'Thousand ';
    n %= 1000;
  }
  if (n > 0) {
    res += convertLessThanThousand(n);
  }

  return 'Rupees ' + res.trim() + ' Only';
};

export default function TaxInvoiceModal({ isOpen, onClose, payment }: TaxInvoiceModalProps) {
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    companyName: 'JCB Exchange',
    gstin: null,
    address: null,
    state: 'Maharashtra',
    city: 'Mumbai',
    defaultGstRate: 18,
    termsAndConditions: 'This is a computer-generated tax invoice and does not require a physical signature.',
  });
  // Keep the local static logo available while the dynamic branding request is
  // loading, and as a safe fallback if an older/missing upload is returned.
  const [logoUrl, setLogoUrl] = useState<string | null>(INVOICE_LOGO_FALLBACK);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      api.get('/master/invoice-settings')
        .then((res) => {
          if (isMounted && res.data) {
            if (res.data.invoice) {
              setInvoiceSettings({
                companyName: res.data.invoice.companyName || 'JCB Exchange',
                gstin: res.data.invoice.gstin || null,
                address: res.data.invoice.address || null,
                state: res.data.invoice.state || 'Maharashtra',
                city: res.data.invoice.city || 'Mumbai',
                defaultGstRate: typeof res.data.invoice.defaultGstRate === 'number' ? res.data.invoice.defaultGstRate : 18,
                termsAndConditions: res.data.invoice.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.',
              });
            }
            const dynamicLogoUrl = getAbsoluteMediaUrl(res.data.siteLogo);
            if (!dynamicLogoUrl) {
              setLogoUrl(INVOICE_LOGO_FALLBACK);
              return;
            }

            // Verify the configured asset before handing it to the invoice
            // HTML and react-pdf renderers. This prevents a stale/missing
            // server upload from producing a broken image in either output.
            const logoProbe = new window.Image();
            logoProbe.onload = () => {
              if (isMounted) setLogoUrl(dynamicLogoUrl);
            };
            logoProbe.onerror = () => {
              if (isMounted) setLogoUrl(INVOICE_LOGO_FALLBACK);
            };
            logoProbe.src = dynamicLogoUrl;
          }
        })
        .catch(() => {
          setLogoUrl(INVOICE_LOGO_FALLBACK);
        })

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen]);

  if (!isOpen || !payment) return null;

  const totalAmount = Number(payment.amount || 0);
  const gstRate = invoiceSettings.defaultGstRate || 18;

  // Calculate Base Taxable Value & Tax Breakdown from Inclusive Total
  const taxableValue = totalAmount > 0 ? totalAmount / (1 + gstRate / 100) : 0;
  const totalTax = totalAmount - taxableValue;

  // Intra-State vs Inter-State supply test
  const supplierState = (invoiceSettings.state || 'Maharashtra').trim().toLowerCase();
  const customerState = (payment.customerState || 'Maharashtra').trim().toLowerCase();
  const isIntraState = !customerState || supplierState === customerState;

  const cgstRate = gstRate / 2;
  const sgstRate = gstRate / 2;
  const cgstAmount = isIntraState ? totalTax / 2 : 0;
  const sgstAmount = isIntraState ? totalTax / 2 : 0;
  const igstAmount = isIntraState ? 0 : totalTax;

  const invoiceNumber = `INV-${payment.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const formattedDate = payment.submittedAt
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(payment.submittedAt))
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      
      const { pdf } = await import('@react-pdf/renderer');
      const { InvoicePDFTemplate } = await import('./InvoicePDFTemplate');

      const blob = await pdf(
        <InvoicePDFTemplate
          invoiceSettings={invoiceSettings}
          payment={payment}
          logoUrl={logoUrl}
          taxableValue={taxableValue}
          totalAmount={totalAmount}
          gstRate={gstRate}
           isIntraState={isIntraState}
          cgstAmount={cgstAmount}
          sgstAmount={sgstAmount}
          igstAmount={igstAmount}
          invoiceNumber={invoiceNumber}
          formattedDate={formattedDate}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      // Fallback to window.print() removed to ensure proper download behavior
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="tax-invoice-print-scope fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white print:static print:inset-auto print:overflow-visible">
      {/* Print Specific CSS Rules */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          html, body {
            background: #ffffff !important;
            color: #111827 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .tax-invoice-print-scope,
          .tax-invoice-print-scope * {
            visibility: visible !important;
          }
          .print\\:hidden, header, footer, nav, aside {
            display: none !important;
          }
          .tax-invoice-print-scope {
            position: relative !important;
            inset: auto !important;
            background: transparent !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
            width: 100% !important;
          }
          .max-h-\\[92vh\\] {
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
          }
          #tax-invoice-content {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .bg-gray-900 {
            background-color: #111827 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bg-gray-50\\/60, .bg-gray-50 {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .bg-amber-50\\/40, .bg-amber-50 {
            background-color: #fffbeb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      <div id="tax-invoice-document" className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl print:shadow-none print:w-full print:max-w-none print:max-h-none print:rounded-none print:overflow-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        
        {/* Modal Action Bar (Hidden on Print) */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 backdrop-blur px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2 text-gray-900 font-semibold text-base">
            <FileText className="h-4 w-4 text-amber-500" />
            <span>Tax Invoice</span>
          </div>
          <div className="tax-invoice-pdf-exclude flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#E5AD06] transition shadow-sm disabled:opacity-60 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
              aria-label="Close invoice modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Invoice Body (Print Target) */}
        <div className="p-6 sm:p-8 font-sans text-gray-800 print:p-6" id="tax-invoice-content">
          
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-3">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt={invoiceSettings.companyName || 'Logo'}
                  className="h-11 w-auto max-w-[150px] object-contain"
                  onError={() => setLogoUrl(INVOICE_LOGO_FALLBACK)}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFC107] font-bold text-black text-sm">
                  JCB
                </div>
              )}
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{invoiceSettings.companyName || 'JCB Exchange'}</h1>
              </div>
            </div>

            <div className="sm:text-right">
              <span className="inline-block rounded bg-amber-500/10 border border-amber-300/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-800">
                TAX INVOICE
              </span>
              <p className="mt-1.5 text-xs font-semibold text-gray-900">Invoice No: <span className="font-mono text-gray-700">{invoiceNumber}</span></p>
              <p className="text-[11px] text-gray-500">Date: {formattedDate}</p>
              {payment.transactionRef && (
                <p className="text-[11px] text-gray-500">Txn Ref: <span className="font-mono">{payment.transactionRef}</span></p>
              )}
            </div>
          </div>

          {/* Billed From & Billed To Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 text-xs">
            {/* Supplier Details */}
            <div className="rounded-xl border border-gray-100 p-3.5 bg-gray-50/60">
              <h2 className="font-semibold text-amber-800 uppercase tracking-wider text-[10px] mb-1.5">
                Billed From (Supplier)
              </h2>
              <p className="font-semibold text-xs text-gray-900">{invoiceSettings.companyName || 'JCB Exchange'}</p>
              {invoiceSettings.address && (
                <p className="text-gray-600 mt-0.5 whitespace-pre-line leading-relaxed text-[11px]">{invoiceSettings.address}</p>
              )}
              <p className="text-gray-600 mt-1 text-[11px]">
                State: <span className="font-medium text-gray-900">{invoiceSettings.state || 'Maharashtra'}</span>
              </p>
              {invoiceSettings.gstin && (
                <p className="text-gray-800 font-mono mt-0.5 text-[11px]">GSTIN: {invoiceSettings.gstin}</p>
              )}
            </div>

            {/* Customer Details */}
            <div className="rounded-xl border border-gray-100 p-3.5 bg-gray-50/60">
              <h2 className="font-semibold text-amber-800 uppercase tracking-wider text-[10px] mb-1.5">
                Billed To (Customer)
              </h2>
              <p className="font-semibold text-xs text-gray-900">{payment.memberName || 'Valued Customer'}</p>
              {payment.customerCity && <p className="text-gray-600 mt-0.5 text-[11px]">City: {payment.customerCity}</p>}
              {payment.customerMobile && (
                <p className="text-gray-600 mt-0.5 text-[11px]">Mobile: {payment.customerMobile}</p>
              )}
              {payment.customerEmail && (
                <p className="text-gray-600 mt-0.5 text-[11px]">Email: {payment.customerEmail}</p>
              )}
              <p className="text-gray-600 mt-1 text-[11px]">
                State: <span className="font-medium text-gray-900">{payment.customerState || invoiceSettings.state || 'Maharashtra'}</span>
              </p>
              <p className="text-gray-500 mt-0.5 text-[10px]">Place of Supply: {payment.customerState || invoiceSettings.state || 'Maharashtra'}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white font-medium text-[11px]">
                  <th className="py-2.5 px-3.5">#</th>
                  <th className="py-2.5 px-3.5">Service Description</th>
                  <th className="py-2.5 px-3.5 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3.5 text-center">GST %</th>
                  <th className="py-2.5 px-3.5 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                <tr className="hover:bg-gray-50/50">
                  <td className="py-2.5 px-3.5 font-medium text-gray-500">1</td>
                  <td className="py-2.5 px-3.5 font-medium text-gray-900">
                    {payment.planName}
                    <p className="text-[10px] text-gray-500 font-normal mt-0.5">Digital Subscription & Machinery Platform Service</p>
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-gray-700">₹{taxableValue.toFixed(2)}</td>
                  <td className="py-2.5 px-3.5 text-center font-medium">{gstRate}%</td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-gray-900">₹{totalAmount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax Breakdown & Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 text-xs">
            {/* Amount In Words */}
            <div className="rounded-xl border border-amber-100 p-3.5 bg-amber-50/40 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Amount in Words</p>
                <p className="text-xs font-semibold text-gray-900 mt-1 italic">{numberToWordsInr(totalAmount)}</p>
              </div>
              <div className="mt-3 pt-2 border-t border-amber-200/50 text-[10px] text-gray-600">
                <p>Payment Method: <span className="font-medium text-gray-900">UPI / Online Transfer</span></p>
                <p>Status: <span className="font-semibold text-emerald-700">PAID & VERIFIED</span></p>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="rounded-xl border border-gray-100 p-3.5 space-y-1.5 bg-gray-50/60 font-mono text-[11px]">
              <div className="flex justify-between text-gray-600">
                <span>Taxable Amount:</span>
                <span>₹{taxableValue.toFixed(2)}</span>
              </div>

              {isIntraState ? (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>CGST ({cgstRate}%):</span>
                    <span>₹{cgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>SGST ({sgstRate}%):</span>
                    <span>₹{sgstAmount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-gray-600">
                  <span>IGST ({gstRate}%):</span>
                  <span>₹{igstAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-gray-200 pt-2 text-xs font-bold text-gray-900">
                <span className="font-sans">Total Amount (Incl. GST):</span>
                <span>₹{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Computer Generated Disclaimer */}
          <div className="border-t border-gray-100 pt-3.5 mt-5 text-[10px] text-gray-500 space-y-1">
            <p className="font-semibold text-gray-700">Terms & Conditions:</p>
            <div className="leading-relaxed text-gray-600 text-[11px] space-y-0.5">
              {(invoiceSettings.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.')
                .split(/\r?\n/)
                .map((line, idx) => (
                  <p key={idx} className="whitespace-pre-wrap">{line}</p>
                ))}
            </div>
            <div className="flex justify-between items-center pt-2.5 text-gray-400 text-[9px]">
              <p>© {new Date().getFullYear()} {invoiceSettings.companyName || 'JCB Exchange'}. All rights reserved.</p>
              <p className="font-mono">Standard Tax Invoice (Indian GST Compliant)</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
