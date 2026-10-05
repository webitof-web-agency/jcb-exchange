"use client";

import React, { useEffect, useState } from 'react';
import { Download, X, FileText } from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';

const INVOICE_LOGO_FALLBACK = '/frontheadlogo.png';

export type InvoiceSettings = {
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

export type SubscriptionInvoiceModalProps = {
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

const DEFAULT_TERMS = `1. This invoice is issued by JCB Exchange (OPC) Private Limited for platform, listing, subscription, advertising, lead generation, verification, promotional or other applicable services availed by the recipient.\n2. GST and other applicable taxes shall be charged as per prevailing laws and the Place of Supply determined from the information provided by the recipient.`;

export default function SubscriptionInvoiceModal({ isOpen, onClose, payment }: SubscriptionInvoiceModalProps) {
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    companyName: 'JCB Exchange',
    gstin: null,
    address: null,
    state: 'Maharashtra',
    city: 'Mumbai',
    defaultGstRate: 18,
    termsAndConditions: DEFAULT_TERMS,
  });
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
                termsAndConditions: res.data.invoice.termsAndConditions || DEFAULT_TERMS,
              });
            }
            const dynamicLogoUrl = getAbsoluteFileUrl(res.data.siteLogo);
            if (!dynamicLogoUrl) {
              setLogoUrl(INVOICE_LOGO_FALLBACK);
              return;
            }

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
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen]);

  if (!isOpen || !payment) return null;

  const totalAmount = Number(payment.amount || 0);
  const gstRate = invoiceSettings.defaultGstRate || 18;

  const taxableValue = totalAmount > 0 ? totalAmount / (1 + gstRate / 100) : 0;
  const totalTax = totalAmount - taxableValue;

  const supplierState = (invoiceSettings.state || 'Maharashtra').trim().toLowerCase();
  const customerState = (payment.customerState || 'Maharashtra').trim().toLowerCase();
  const isIntraState = !customerState || supplierState === customerState;

  const cgstAmount = isIntraState ? totalTax / 2 : 0;
  const sgstAmount = isIntraState ? totalTax / 2 : 0;
  const igstAmount = isIntraState ? 0 : totalTax;

  const invoiceNumber = `INV-${payment.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const formattedDate = payment.submittedAt
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' }).format(new Date(payment.submittedAt))
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      
      const { pdf } = await import('@react-pdf/renderer');
      const { SubscriptionInvoicePDFTemplate } = await import('./SubscriptionInvoicePDFTemplate');

      const blob = await pdf(
        <SubscriptionInvoicePDFTemplate
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
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="tax-invoice-print-scope fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white print:static print:inset-auto print:overflow-visible">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 10mm; }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important; padding: 0 !important;
          }
          body * { visibility: hidden !important; }
          .tax-invoice-print-scope, .tax-invoice-print-scope * { visibility: visible !important; }
          .print\\:hidden, header, footer, nav, aside { display: none !important; }
          .tax-invoice-print-scope {
            position: relative !important; inset: auto !important; background: transparent !important;
            padding: 0 !important; display: block !important; overflow: visible !important; width: 100% !important;
          }
          .max-h-\\[92vh\\] { max-height: none !important; overflow: visible !important; border: none !important; box-shadow: none !important; }
          #tax-invoice-content { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
        }
      `}</style>
      
      <div id="tax-invoice-document" className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white shadow-2xl print:shadow-none print:w-full print:max-w-none print:max-h-none print:overflow-visible">
        
        {/* Action Bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/95 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4" /> <span>Subscription Invoice</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
            <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Invoice Document Body */}
        <div className="p-4 sm:p-6 font-sans text-black print:p-0" id="tax-invoice-content">
          
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-xl sm:text-3xl font-bold uppercase">Subscription Invoice</h1>
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain" onError={() => setLogoUrl(INVOICE_LOGO_FALLBACK)} />
            ) : (
              <div className="h-16 w-16 bg-gray-200" />
            )}
          </div>

          {/* 1. Invoice Details */}
          <div className="border border-black mb-4 text-[11px] sm:text-xs">
            <div className="font-bold border-b border-black px-2 py-1">1. INVOICE Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 p-2">
              <div className="flex"><span className="w-32 font-medium">Invoice No:</span> <span className="font-bold">{invoiceNumber}</span></div>
              <div className="flex"><span className="w-32 font-medium">Generated Date:</span> <span className="font-bold">{formattedDate}</span></div>
              <div className="flex"><span className="w-32 font-medium">GSTIN:</span> <span className="font-bold">{invoiceSettings.gstin || 'URP'}</span></div>
              <div className="flex"><span className="w-32 font-medium">Generated By:</span> <span>System</span></div>
              <div className="flex"><span className="w-32 font-medium">Payment Status:</span> <span className="font-bold text-green-700">PAID & VERIFIED</span></div>
              {payment.transactionRef && (
                <div className="flex"><span className="w-32 font-medium">Txn Ref:</span> <span>{payment.transactionRef}</span></div>
              )}
            </div>
          </div>

          {/* 2. Address Details */}
          <div className="border border-black mb-4 text-[11px] sm:text-xs">
            <div className="font-bold border-b border-black px-2 py-1">2. Address Details</div>
            
            <div className="flex flex-col sm:flex-row">
              {/* FROM */}
              <div className="flex-1 border-b sm:border-b-0 sm:border-r border-black flex flex-col">
                <div className="font-bold text-[#b45309] border-b border-black px-2 py-1 uppercase">BILLED FROM (SUPPLIER)</div>
                <div className="p-2 space-y-1">
                  <div className="font-bold uppercase">{invoiceSettings.companyName || 'JCB Exchange'}</div>
                  {invoiceSettings.address && <div className="uppercase">{invoiceSettings.address}</div>}
                  <div className="uppercase">
                    {[invoiceSettings.city, invoiceSettings.state].filter(Boolean).join(', ') || 'Maharashtra'}
                  </div>
                </div>
              </div>
              
              {/* TO */}
              <div className="flex-1 flex flex-col">
                <div className="font-bold text-[#b45309] border-b border-black px-2 py-1 uppercase">BILLED TO (CUSTOMER)</div>
                <div className="p-2 space-y-1">
                  <div className="font-bold uppercase">{payment.memberName || 'Customer'}</div>
                  <div className="uppercase">
                    {[payment.customerCity, payment.customerState || invoiceSettings.state].filter(Boolean).join(', ') || 'Maharashtra'}
                  </div>
                  {payment.customerMobile && <div>Mobile: {payment.customerMobile}</div>}
                  {payment.customerEmail && <div>Email: {payment.customerEmail}</div>}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Service Details */}
          <div className="border border-black mb-4 text-[10px] sm:text-[11px]">
            <div className="font-bold border-b border-black px-2 py-1 text-xs">3. Service Details</div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black font-bold">
                  <th className="p-1.5 border-r border-black w-12 text-center">S.No</th>
                  <th className="p-1.5 border-r border-black">Service Name & Desc.</th>
                  <th className="p-1.5 border-r border-black w-36 text-right">Taxable Amount Rs.</th>
                  <th className="p-1.5 w-36 text-center">Tax Rate (C+S+I)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black">
                  <td className="p-1.5 border-r border-black text-center">1</td>
                  <td className="p-1.5 border-r border-black uppercase font-medium">{payment.planName}</td>
                  <td className="p-1.5 border-r border-black text-right">{taxableValue.toFixed(2)}</td>
                  <td className="p-1.5 text-center">{gstRate}%</td>
                </tr>
              </tbody>
            </table>

            {/* Totals Sub-Table */}
            <div className="bg-gray-50/50">
              <div className="flex border-b border-black font-bold text-[9px] sm:text-[10px]">
                <div className="flex-1 p-1 border-r border-black">Tot. Tax'ble Amt</div>
                <div className="flex-1 p-1 border-r border-black">CGST Amt</div>
                <div className="flex-1 p-1 border-r border-black">SGST Amt</div>
                <div className="flex-1 p-1 border-r border-black">IGST Amt</div>
                <div className="flex-1 p-1 border-r border-black">CESS Amt</div>
                <div className="flex-1 p-1 border-r border-black">Other Amt</div>
                <div className="flex-1 p-1">Total Inv.Amt</div>
              </div>
              <div className="flex p-1.5 gap-1.5 bg-white">
                <div className="flex-1 border border-black p-1 text-right">{taxableValue.toFixed(2)}</div>
                <div className="flex-1 border border-black p-1 text-right">{cgstAmount.toFixed(2)}</div>
                <div className="flex-1 border border-black p-1 text-right">{sgstAmount.toFixed(2)}</div>
                <div className="flex-1 border border-black p-1 text-right">{igstAmount.toFixed(2)}</div>
                <div className="flex-1 border border-black p-1 text-right">0.00</div>
                <div className="flex-1 border border-black p-1 text-right">0.00</div>
                <div className="flex-1 border border-black p-1 text-right font-bold">{totalAmount.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* 4. Payment & Conditions */}
          <div className="border border-black text-[11px] sm:text-xs">
            <div className="font-bold border-b border-black px-2 py-1">4. Payment & Conditions</div>
            <div className="p-2 border-b border-black">
              <span className="font-bold">Amount in Words:</span> {numberToWordsInr(totalAmount)}
            </div>
            <div className="p-2 text-[10px] sm:text-[11px] leading-relaxed">
              <div className="font-bold mb-1">Terms & Conditions:</div>
              <div className="whitespace-pre-line space-y-0.5">
                {invoiceSettings.termsAndConditions || DEFAULT_TERMS}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
