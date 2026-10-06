'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import LiveInvoiceEditorModal, {
  type LiveInvoicePaymentData,
  type SavedListingBill,
} from '@/components/portal/LiveInvoiceEditorModal';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as { response?: { data?: { error?: string } } };
  return axiosError.response?.data?.error || fallback;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getPaymentForBill = (bill: SavedListingBill): LiveInvoicePaymentData => {
  const payment = bill.payment;
  const payload = bill.payload;
  const buyer = payment?.buyer;
  const partner = payment?.partner;
  return {
    id: bill.paymentId,
    memberName: payload.memberName || buyer?.name || partner?.name || 'Customer',
    planName: payload.itemDescription || payment?.listing?.title || 'Listing Payment',
    amount: Number(payload.amount ?? payment?.amount ?? 0),
    submittedAt: payment?.submittedAt || bill.updatedAt,
    transactionRef: payment?.transactionRef || null,
    customerEmail: payload.customerEmail || buyer?.email || partner?.email || null,
    customerMobile: payload.customerMobile || buyer?.mobile || partner?.mobile || null,
    customerCity: buyer?.city || null,
    customerState: payload.customerState || buyer?.state || null,
  };
};

export default function ListingBillsTable() {
  const [bills, setBills] = useState<SavedListingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBill, setEditingBill] = useState<SavedListingBill | null>(null);

  const loadBills = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ bills: SavedListingBill[] }>('/superadmin/listing-bills');
      setBills(response.data.bills || []);
    } catch (loadError) {
      const message = getApiErrorMessage(loadError, 'Unable to load saved bills.');
      setError(message);
      if (showRefresh) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBills();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBills]);

  const handleDelete = async (bill: SavedListingBill) => {
    if (!window.confirm(`Delete ${bill.payload.invoiceNumber || 'this bill'}?`)) return;
    try {
      await api.delete(`/superadmin/listing-bills/${bill.id}`);
      setBills((current) => current.filter((item) => item.id !== bill.id));
      toast.success('Bill deleted successfully.');
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, 'Unable to delete bill.'));
    }
  };

  const handleDownloadPdf = async (bill: SavedListingBill) => {
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const payload = bill.payload;
      const invoiceNumber = payload.invoiceNumber || 'BILL';
      const invoiceDate = payload.invoiceDate || formatDate(bill.updatedAt);
      const memberName = payload.memberName || bill.payment?.buyer?.name || bill.payment?.partner?.name || 'Customer';
      const itemDescription = payload.itemDescription || bill.payment?.listing?.title || 'Listing Payment';
      const numericAmount = Number(payload.amount ?? bill.payment?.amount ?? 0);
      const customerEmail = payload.customerEmail || bill.payment?.buyer?.email || bill.payment?.partner?.email || '';
      const customerMobile = payload.customerMobile || bill.payment?.buyer?.mobile || bill.payment?.partner?.mobile || '';
      const customerState = payload.customerState || bill.payment?.buyer?.state || '';
      const logoUrl = payload.logoUrl || '/loadinglogo.png';

      const fallbackSettings = {
        companyName: 'JCB EXCHANGE HUB PRIVATE LIMITED',
        gstin: null,
        address: null,
        city: null,
        state: null,
        termsAndConditions: null,
      };

      let invoiceSettings = payload.invoiceSettings;
      if (!invoiceSettings) {
        try {
          const res = await api.get<{ settings: any }>('/superadmin/invoice-settings');
          invoiceSettings = res.data.settings;
        } catch {
          invoiceSettings = fallbackSettings;
        }
      }

      const safeSettings = invoiceSettings || fallbackSettings;

      toast.info(`Generating PDF for ${invoiceNumber}...`);

      if (bill.billType === 'NON_TAX') {
        const { NonTaxInvoicePDFTemplate } = await import('@/components/portal/NonTaxInvoicePDFTemplate');
        const blob = await pdf(
          <NonTaxInvoicePDFTemplate
            invoiceSettings={safeSettings}
            payment={{
              memberName,
              planName: itemDescription,
              transactionRef: bill.payment?.transactionRef,
              customerEmail,
              customerMobile,
              customerCity: bill.payment?.buyer?.city || null,
              customerState,
            }}
            logoUrl={logoUrl}
            totalAmount={numericAmount}
            invoiceNumber={invoiceNumber}
            formattedDate={invoiceDate}
            invoiceTitle="BILL / PAYMENT RECEIPT"
            itemDescription={itemDescription}
            notes={safeSettings.termsAndConditions || undefined}
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
        toast.success('PDF downloaded successfully!');
      } else {
        const gstRate = Number(payload.gstRate || 18);
        const isIntraState = payload.taxType === 'INTRA_STATE';
        const taxableValue = Number((numericAmount / (1 + gstRate / 100)).toFixed(2));
        const totalTaxAmount = Number((numericAmount - taxableValue).toFixed(2));
        const cgstAmount = isIntraState ? Number((totalTaxAmount / 2).toFixed(2)) : 0;
        const sgstAmount = isIntraState ? Number((totalTaxAmount / 2).toFixed(2)) : 0;
        const igstAmount = !isIntraState ? totalTaxAmount : 0;

        const { SubscriptionInvoicePDFTemplate } = await import('@/components/portal/SubscriptionInvoicePDFTemplate');
        const blob = await pdf(
          <SubscriptionInvoicePDFTemplate
            invoiceSettings={safeSettings}
            payment={{
              memberName,
              planName: itemDescription,
              transactionRef: bill.payment?.transactionRef,
              customerEmail,
              customerMobile,
              customerCity: bill.payment?.buyer?.city || null,
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
        toast.success('PDF downloaded successfully!');
      }
    } catch (err) {
      console.error('Failed to generate PDF directly:', err);
      toast.info('Opening bill editor for download...');
      setEditingBill(bill);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading saved bills...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Saved Bills</h3>
          <p className="text-xs text-gray-500">Open a bill to edit fields or download the selected bill format.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadBills(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:border-amber-400 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {bills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          No bills saved yet. Generate a bill from Payment Verification to see it here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Bill No.</th>
                <th className="px-4 py-3 font-semibold">Listing / Customer</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-amber-50/30">
                  <td className="px-4 py-4 font-semibold text-gray-900">{bill.payload.invoiceNumber || '—'}</td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-gray-900">{bill.payload.itemDescription || bill.payment?.listing?.title || 'Listing Payment'}</div>
                    <div className="text-xs text-gray-500">{bill.payload.memberName || 'Customer'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${bill.billType === 'TAX_INVOICE' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {bill.billType === 'TAX_INVOICE' ? 'Tax Invoice' : 'Non-Tax Bill'}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-900">{formatCurrency(Number(bill.payload.amount || 0))}</td>
                  <td className="px-4 py-4 text-gray-600">{formatDate(bill.updatedAt)}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <PortalActionDropdown
                        align="right"
                        items={[
                          {
                            label: 'Edit Bill',
                            icon: <Pencil className="h-4 w-4 text-amber-600" />,
                            onClick: () => setEditingBill(bill),
                          },
                          {
                            label: 'Download PDF',
                            icon: <Download className="h-4 w-4 text-emerald-600" />,
                            onClick: () => void handleDownloadPdf(bill),
                          },
                          {
                            label: 'Delete Bill',
                            icon: <Trash2 className="h-4 w-4 text-red-600" />,
                            variant: 'danger' as const,
                            onClick: () => void handleDelete(bill),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingBill ? (
        <LiveInvoiceEditorModal
          isOpen
          onClose={() => setEditingBill(null)}
          payment={getPaymentForBill(editingBill)}
          initialType={editingBill.billType}
          savedBill={editingBill}
          onSaved={(savedBill) => {
            setBills((current) => current.some((item) => item.id === savedBill.id)
              ? current.map((item) => (item.id === savedBill.id ? savedBill : item))
              : [savedBill, ...current]);
            setEditingBill(savedBill);
          }}
        />
      ) : null}
    </div>
  );
}
