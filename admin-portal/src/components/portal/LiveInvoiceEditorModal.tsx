'use client';

import React, { useEffect, useState } from 'react';
import { Download, Printer, X, FileText, Check, FileCheck, Building2, Sparkles, Hash, Calendar, User, Phone, Mail, CreditCard, MapPin } from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import type { InvoiceSettings } from './SubscriptionInvoicePDFTemplate';

const INVOICE_LOGO_FALLBACK = '/frontheadlogo.png';

export type LiveInvoicePaymentData = {
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

export type LiveInvoiceEditorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  payment: LiveInvoicePaymentData | null;
  initialType?: 'NON_TAX' | 'TAX_INVOICE';
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

  return res.trim() + ' Rupees Only';
};

export default function LiveInvoiceEditorModal({
  isOpen,
  onClose,
  payment,
  initialType = 'NON_TAX',
}: LiveInvoiceEditorModalProps) {
  const [invoiceType, setInvoiceType] = useState<'NON_TAX' | 'TAX_INVOICE'>(initialType);
  const [taxType, setTaxType] = useState<'INTRA_STATE' | 'INTER_STATE'>('INTRA_STATE');
  const [logoUrl, setLogoUrl] = useState<string>(INVOICE_LOGO_FALLBACK);

  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    companyName: 'JCB Exchange',
    gstin: '',
    address: 'Corporate Tower, Main Road',
    state: 'Maharashtra',
    city: 'Mumbai',
    termsAndConditions: 'This is a computer-generated document and does not require a physical signature.',
  });

  // Editable Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [memberName, setMemberName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerState, setCustomerState] = useState('Maharashtra');
  const [itemDescription, setItemDescription] = useState('');
  const [amountInput, setAmountInput] = useState<string>('0');
  const [gstRate, setGstRate] = useState<number>(18);
  const [customNotes, setCustomNotes] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (payment) {
      // Check if there is an existing saved invoice in localStorage
      let savedData: {
        invoiceNumber?: string;
        invoiceType?: 'NON_TAX' | 'TAX_INVOICE';
        invoiceDate?: string;
        memberName?: string;
        customerMobile?: string;
        customerEmail?: string;
        customerState?: string;
        itemDescription?: string;
        amount?: number;
        customNotes?: string;
        taxType?: 'INTRA_STATE' | 'INTER_STATE';
      } | null = null;

      try {
        const stored = localStorage.getItem(`jcb_invoice_${payment.id}`);
        if (stored) {
          savedData = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Could not read saved invoice:', e);
      }

      const dt = payment.submittedAt ? new Date(payment.submittedAt) : new Date();
      const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const rawNum = payment.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();

      if (savedData) {
        if (savedData.invoiceType) setInvoiceType(savedData.invoiceType);
        if (savedData.taxType) setTaxType(savedData.taxType);
        setInvoiceNumber(savedData.invoiceNumber || (invoiceType === 'TAX_INVOICE' ? `TAX-${rawNum}` : `BILL-${rawNum}`));
        setInvoiceDate(savedData.invoiceDate || dateStr);
        setMemberName(savedData.memberName || payment.memberName || 'Customer');
        setCustomerMobile(savedData.customerMobile || payment.customerMobile || '');
        setCustomerEmail(savedData.customerEmail || payment.customerEmail || '');
        setCustomerState(savedData.customerState || payment.customerState || invoiceSettings.state || 'Maharashtra');
        setItemDescription(savedData.itemDescription || payment.planName || 'Listing / Subscription Charge');
        setAmountInput(savedData.amount !== undefined ? savedData.amount.toString() : (payment.amount || 0).toString());
        setCustomNotes(savedData.customNotes || (invoiceType === 'NON_TAX' ? 'This is an official payment bill/receipt. No GST or tax is charged.' : 'This is an official Tax Invoice issued under GST regulations.'));
      } else {
        setInvoiceNumber(invoiceType === 'TAX_INVOICE' ? `TAX-${rawNum}` : `BILL-${rawNum}`);
        setInvoiceDate(dateStr);
        setMemberName(payment.memberName || 'Customer');
        setCustomerMobile(payment.customerMobile || '');
        setCustomerEmail(payment.customerEmail || '');
        setCustomerState(payment.customerState || invoiceSettings.state || 'Maharashtra');
        setItemDescription(payment.planName || 'Listing / Subscription Charge');
        setAmountInput((payment.amount || 0).toString());
        setCustomNotes(
          invoiceType === 'NON_TAX'
            ? 'This is an official payment bill/receipt. No GST or tax is charged.'
            : 'This is an official Tax Invoice issued under GST regulations.'
        );
      }
    }
  }, [payment, invoiceType, invoiceSettings.state]);

  // Fetch Company Settings & Settings Logo (dark logo / site logo)
  useEffect(() => {
    let isMounted = true;

    const fetchSettingsAndLogo = async () => {
      try {
        const brandingRes = await api.get<{
          data?: {
            imageUrl?: string | null;
            darkLogoUrl?: string | null;
          };
        }>('/master/site-logo').catch(() => null);

        const rawLogo = brandingRes?.data?.data?.darkLogoUrl || brandingRes?.data?.data?.imageUrl;
        if (rawLogo) {
          const absLogo = getAbsoluteFileUrl(rawLogo);
          if (absLogo && isMounted) {
            setLogoUrl(absLogo);
          }
        }

        const res = await api.get<{
          companyInvoice?: {
            companyName?: string;
            gstin?: string;
            address?: string;
            state?: string;
            city?: string;
            defaultGstRate?: number;
            termsAndConditions?: string;
          };
          siteLogo?: string | null;
          darkLogo?: string | null;
        }>('/superadmin/settings');

        if (res.data?.companyInvoice && isMounted) {
          const compState = res.data.companyInvoice.state || 'Maharashtra';
          setInvoiceSettings({
            companyName: res.data.companyInvoice.companyName || 'JCB Exchange',
            gstin: res.data.companyInvoice.gstin || '',
            address: res.data.companyInvoice.address || 'Corporate Tower',
            state: compState,
            city: res.data.companyInvoice.city || 'Mumbai',
            termsAndConditions: res.data.companyInvoice.termsAndConditions || 'Computer generated invoice.',
          });
          if (res.data.companyInvoice.defaultGstRate !== undefined) {
            setGstRate(Number(res.data.companyInvoice.defaultGstRate));
          }
        }

        if (!rawLogo && (res.data?.darkLogo || res.data?.siteLogo)) {
          const settingsLogo = getAbsoluteFileUrl(res.data?.darkLogo || res.data?.siteLogo);
          if (settingsLogo && isMounted) {
            setLogoUrl(settingsLogo);
          }
        }
      } catch (err) {
        console.warn('Failed to load company invoice settings:', err);
      }
    };

    if (isOpen) {
      void fetchSettingsAndLogo();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen || !payment) return null;

  const numericAmount = Math.max(0, Number(amountInput) || 0);

  const isIntraState = taxType === 'INTRA_STATE';
  const taxableValue = invoiceType === 'TAX_INVOICE' ? Number((numericAmount / (1 + gstRate / 100)).toFixed(2)) : numericAmount;
  const totalTaxAmount = Number((numericAmount - taxableValue).toFixed(2));
  const cgstAmount = isIntraState ? Number((totalTaxAmount / 2).toFixed(2)) : 0;
  const sgstAmount = isIntraState ? Number((totalTaxAmount / 2).toFixed(2)) : 0;
  const igstAmount = !isIntraState ? totalTaxAmount : 0;
  const wordsAmount = numberToWordsInr(numericAmount);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const { pdf } = await import('@react-pdf/renderer');

      if (invoiceType === 'NON_TAX') {
        const { NonTaxInvoicePDFTemplate } = await import('./NonTaxInvoicePDFTemplate');
        const blob = await pdf(
          <NonTaxInvoicePDFTemplate
            invoiceSettings={invoiceSettings}
            payment={{
              memberName,
              planName: itemDescription,
              transactionRef: payment.transactionRef,
              customerEmail,
              customerMobile,
              customerCity: payment.customerCity,
              customerState,
            }}
            logoUrl={logoUrl}
            totalAmount={numericAmount}
            invoiceNumber={invoiceNumber}
            formattedDate={invoiceDate}
            invoiceTitle="BILL / PAYMENT RECEIPT"
            itemDescription={itemDescription}
            notes={customNotes}
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
      } else {
        const { SubscriptionInvoicePDFTemplate } = await import('./SubscriptionInvoicePDFTemplate');
        const blob = await pdf(
          <SubscriptionInvoicePDFTemplate
            invoiceSettings={invoiceSettings}
            payment={{
              memberName,
              planName: itemDescription,
              transactionRef: payment.transactionRef,
              customerEmail,
              customerMobile,
              customerCity: payment.customerCity,
              customerState,
            }}
            logoUrl={logoUrl}
            taxableValue={taxableValue}
            totalAmount={numericAmount}
            gstRate={gstRate}
            isIntraState={isIntraState}
            cgstAmount={cgstAmount}
            sgstAmount={sgstAmount}
            igstAmount={igstAmount}
            invoiceNumber={invoiceNumber}
            formattedDate={invoiceDate}
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
      }
    } catch (err) {
      console.error('PDF Generation Error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSave = () => {
    const savedRecord = {
      paymentId: payment.id,
      invoiceNumber,
      invoiceType,
      taxType,
      invoiceDate,
      memberName,
      customerMobile,
      customerEmail,
      customerState,
      itemDescription,
      amount: numericAmount,
      customNotes,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`jcb_invoice_${payment.id}`, JSON.stringify(savedRecord));
    } catch (e) {
      console.warn('Failed to store invoice locally:', e);
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md overflow-hidden print:bg-white print:static print:inset-auto">
      {/* ── Top Header Control Bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3.5 print:hidden">
        {/* Left Title & Invoice Type Switcher */}
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400 border border-amber-400/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Live Invoice &amp; Bill Generator</h2>
            <p className="text-xs text-slate-400">Edit fields directly on live template &amp; save PDF</p>
          </div>

          {/* Type Toggle Switcher Pills */}
          <div className="ml-4 flex items-center rounded-xl bg-slate-800/80 p-1 border border-slate-700/80">
            <button
              type="button"
              onClick={() => setInvoiceType('NON_TAX')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                invoiceType === 'NON_TAX'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <FileCheck className="h-3.5 w-3.5" />
              <span>Non-Tax Bill (0% GST)</span>
            </button>
            <button
              type="button"
              onClick={() => setInvoiceType('TAX_INVOICE')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                invoiceType === 'TAX_INVOICE'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Tax Invoice (GST)</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {savedSuccess ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              <Check className="h-4 w-4" /> Invoice Saved &amp; Attached!
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-500 cursor-pointer shadow-sm"
          >
            <Check className="h-4 w-4" />
            <span>Save Invoice</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4 text-amber-400" />
            <span>{downloading ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white cursor-pointer ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Main Workspace Scrollable Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-900/60 [scrollbar-width:thin]">
        {/* Real A4 Paper Sheet Card */}
        <div className="w-full max-w-[850px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 sm:p-12 text-slate-900 font-sans text-xs print:p-0 print:border-none print:shadow-none print:w-full self-start">
          
          {/* Header Banner */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
            <div>
              <div className="inline-block bg-slate-900 text-white px-3.5 py-1 text-xs font-black tracking-widest uppercase rounded-lg mb-2 shadow-xs">
                {invoiceType === 'NON_TAX' ? 'BILL / PAYMENT RECEIPT' : 'TAX INVOICE'}
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{invoiceSettings.companyName}</h1>
              <p className="text-slate-500 text-[11px] max-w-sm mt-1 leading-relaxed">
                {invoiceSettings.address}, {invoiceSettings.city}, {invoiceSettings.state}
              </p>
              {invoiceType === 'TAX_INVOICE' && invoiceSettings.gstin ? (
                <p className="text-xs font-bold text-slate-800 mt-1">GSTIN: {invoiceSettings.gstin}</p>
              ) : null}
            </div>

            <div className="text-right flex flex-col items-end">
              <img
                src={logoUrl}
                alt="Company Logo"
                className="h-12 w-auto object-contain mb-2"
                onError={() => setLogoUrl(INVOICE_LOGO_FALLBACK)}
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                {invoiceType === 'NON_TAX' ? 'No Tax Charged' : 'GST Compliant'}
              </span>
            </div>
          </div>

          {/* Section 1: Invoice Meta Info Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 rounded-xl bg-slate-50 p-4 border border-slate-200/80">
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                <Hash className="h-3 w-3 text-amber-500" />
                <span>{invoiceType === 'NON_TAX' ? 'Receipt / Bill No.' : 'Invoice No.'}</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                <Calendar className="h-3 w-3 text-amber-500" />
                <span>Date &amp; Time</span>
              </label>
              <input
                type="text"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Section 2: Customer Details Card */}
          <div className="mb-6 rounded-xl border border-slate-200/90 p-4 bg-white">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2 mb-3">
              Customer / Buyer Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase mb-1">
                  <User className="h-3 w-3 text-slate-400" />
                  <span>Customer Name</span>
                </label>
                <input
                  type="text"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-amber-400"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase mb-1">
                  <Phone className="h-3 w-3 text-slate-400" />
                  <span>Mobile Number</span>
                </label>
                <input
                  type="text"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-amber-400"
                  placeholder="Enter Mobile"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase mb-1">
                  <Mail className="h-3 w-3 text-slate-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-amber-400"
                  placeholder="Enter Email"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase mb-1">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  <span>Customer State / Place of Supply</span>
                </label>
                <input
                  type="text"
                  value={customerState}
                  onChange={(e) => setCustomerState(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-amber-400"
                  placeholder="e.g. Maharashtra"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase mb-1">
                  <CreditCard className="h-3 w-3 text-slate-400" />
                  <span>UTR / Payment Ref</span>
                </label>
                <input
                  type="text"
                  value={payment.transactionRef || 'N/A'}
                  readOnly
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Particulars Item Table */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Item / Service Description</th>
                  <th className="p-3 w-16 text-center">Qty</th>
                  <th className="p-3 w-40 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200 bg-white">
                  <td className="p-3 text-center font-bold text-slate-400">1</td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={itemDescription}
                      onChange={(e) => setItemDescription(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:bg-white focus:border-amber-400"
                    />
                  </td>
                  <td className="p-3 text-center font-bold text-slate-800">1</td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-xs font-black text-right text-slate-900 outline-none focus:bg-white focus:border-amber-500"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section 4: Summary Calculations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 items-start">
            {/* Amount in words */}
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Total Amount in Words:
              </span>
              <p className="text-xs font-bold italic text-slate-900 leading-relaxed">{wordsAmount}</p>
            </div>

            {/* Calculations Breakdown */}
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs bg-white">
              {invoiceType === 'TAX_INVOICE' ? (
                <>
                  {/* Tax Type Selector (Intra-state CGST+SGST vs Inter-state IGST) */}
                  <div className="p-2.5 bg-amber-50/80 border-b border-amber-200/80 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-amber-900">Tax Breakdown Type:</span>
                    <div className="flex items-center gap-1 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setTaxType('INTRA_STATE')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${
                          taxType === 'INTRA_STATE'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        CGST + SGST (Same State)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxType('INTER_STATE')}
                        className={`px-2 py-0.5 rounded transition cursor-pointer ${
                          taxType === 'INTER_STATE'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        IGST (Other State)
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="text-slate-600 font-medium">Taxable Value:</span>
                    <span className="font-bold text-slate-900">₹{taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {taxType === 'INTRA_STATE' ? (
                    <>
                      <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                        <span className="text-slate-600 font-medium">CGST ({gstRate / 2}%):</span>
                        <span className="font-semibold text-slate-800">₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                        <span className="text-slate-600 font-medium">SGST ({gstRate / 2}%):</span>
                        <span className="font-semibold text-slate-800">₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between px-4 py-2 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">IGST ({gstRate}%):</span>
                      <span className="font-semibold text-slate-800">₹{igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex justify-between px-4 py-2.5 border-b border-slate-100 bg-emerald-50/70">
                  <span className="text-emerald-800 font-bold">Tax Charge (0% GST):</span>
                  <span className="font-black text-emerald-900">₹0.00 (Exempt / Non-Tax)</span>
                </div>
              )}

              <div className="flex justify-between px-4 py-3 bg-slate-900 text-white font-black text-sm">
                <span>TOTAL AMOUNT:</span>
                <span>₹{numericAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Section 5: Terms & Notes */}
          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Terms &amp; Notes (Editable)
            </label>
            <textarea
              rows={2}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 outline-none focus:bg-white focus:border-amber-400"
            />
          </div>

          <div className="mt-6 text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
            This is a computer-generated document. Thank you for doing business with {invoiceSettings.companyName}.
          </div>
        </div>
      </div>
    </div>
  );
}
