/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  FileText,
  Loader2,
  Pencil,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { sanitizeFinanceFieldValue, sanitizeFinanceFormData } from '@/lib/financeFormSanitizers';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';

type FinanceType = 'DEBIT' | 'CREDIT';
type PaymentMethod = 'CASH' | 'UPI' | 'NEFT' | 'RTGS' | 'IMPS' | 'BANK_TRANSFER' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'CHEQUE' | 'OTHER';

type FinanceTransaction = {
  id: string;
  transactionDate: string;
  valueDate: string | null;
  type: FinanceType;
  amount: number;
  balance: number | null;
  accountName: string;
  paymentMethod: PaymentMethod;
  name: string;
  category: string;
  narration: string;
  reference: string | null;
  chequeNumber: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  source: 'MANUAL' | 'IMPORT';
  createdAt?: string;
  updatedAt?: string;
};

type FinanceForm = {
  transactionDate: string;
  valueDate: string;
  type: FinanceType;
  amount: string;
  balance: string;
  accountName: string;
  paymentMethod: PaymentMethod;
  name: string;
  category: string;
  narration: string;
  reference: string;
  chequeNumber: string;
  invoiceNumber: string;
  notes: string;
};

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'IMPS', label: 'IMPS' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'DEBIT_CARD', label: 'Debit Card' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

const defaultCategories = [
  'Office Expense',
  'Travel',
  'Fuel',
  'Rent',
  'Utilities',
  'Salary',
  'Bank Charges',
  'Tax',
  'Vehicle Expense',
  'Miscellaneous',
  'Imported / Uncategorized',
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20';

const label = (textVal: string) => textVal.replace(/_/g, ' ');

const moneyLabel = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dateLabel = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dateTimeLabel = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const dateInputValue = (value: string | null | undefined) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const errorMessage = (requestError: unknown, fallback: string) => {
  if (
    requestError &&
    typeof requestError === 'object' &&
    'response' in requestError &&
    requestError.response &&
    typeof requestError.response === 'object' &&
    'data' in requestError.response &&
    requestError.response.data &&
    typeof requestError.response.data === 'object' &&
    'error' in requestError.response.data &&
    typeof requestError.response.data.error === 'string'
  ) {
    return requestError.response.data.error;
  }
  return fallback;
};

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = params?.id as string;

  const { user, hasHydrated, isAuthenticated } = useAuthStore();
  const userPermissions = useMemo(() => user?.permissions || [], [user?.permissions]);
  const canRead = useMemo(() => hasAnyPermission(userPermissions, ['finance.read', 'finance.manage']), [userPermissions]);
  const canUpdate = useMemo(() => hasAnyPermission(userPermissions, ['finance.manage']), [userPermissions]);
  const canDelete = useMemo(() => hasAnyPermission(userPermissions, ['finance.manage']), [userPermissions]);

  const [transaction, setTransaction] = useState<FinanceTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>(defaultCategories);

  // Edit Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FinanceForm>({
    transactionDate: '',
    valueDate: '',
    type: 'DEBIT',
    amount: '',
    balance: '',
    accountName: '',
    paymentMethod: 'CASH',
    name: '',
    category: '',
    narration: '',
    reference: '',
    chequeNumber: '',
    invoiceNumber: '',
    notes: '',
  });

  const listPath = useMemo(() => {
    if (pathname.startsWith('/superadmin')) return '/superadmin/finance/expenses';
    if (pathname.startsWith('/admin')) return '/admin/finance/expenses';
    return '/employee/finance/expenses';
  }, [pathname]);

  const loadDetail = useCallback(async () => {
    if (!id || !hasHydrated || !isAuthenticated || !canRead) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/finance/transactions/${id}`);
      if (response.data?.transaction) {
        setTransaction(response.data.transaction);
      } else {
        setError('Transaction record not found.');
      }
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load transaction details.'));
    } finally {
      setLoading(false);
    }
  }, [canRead, hasHydrated, id, isAuthenticated]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !canRead) return;
    api
      .get('/finance/categories')
      .then((response) => setCategories(response.data?.categories?.length ? response.data.categories : defaultCategories))
      .catch(() => setCategories(defaultCategories));
  }, [canRead, hasHydrated, isAuthenticated]);

  const openEditModal = () => {
    if (!transaction) return;
    setForm(
      sanitizeFinanceFormData<FinanceForm>({
        transactionDate: dateInputValue(transaction.transactionDate),
        valueDate: dateInputValue(transaction.valueDate),
        type: transaction.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
        amount: String(transaction.amount),
        balance: transaction.balance === null ? '' : String(transaction.balance),
        accountName: transaction.accountName.toUpperCase(),
        paymentMethod: transaction.paymentMethod,
        name: transaction.name,
        category: transaction.category,
        narration: transaction.narration,
        reference: transaction.reference || '',
        chequeNumber: transaction.chequeNumber || '',
        invoiceNumber: transaction.invoiceNumber || '',
        notes: transaction.notes || '',
      })
    );
    setFormOpen(true);
  };

  const updateForm = (key: keyof FinanceForm, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: sanitizeFinanceFieldValue(key, value, { finalize: false }),
    }));

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transaction) return;
    const sanitizedForm = sanitizeFinanceFormData(form);
    setForm(sanitizedForm);

    if (
      !sanitizedForm.transactionDate ||
      !sanitizedForm.amount ||
      !Number.isFinite(Number(sanitizedForm.amount)) ||
      Number(sanitizedForm.amount) <= 0 ||
      !sanitizedForm.accountName.trim() ||
      !sanitizedForm.name.trim() ||
      !sanitizedForm.narration.trim()
    ) {
      toast.error('Date, bank name, amount, name and narration are required.');
      return;
    }

    try {
      setSaving(true);
      const response = await api.put(`/finance/transactions/${transaction.id}`, sanitizedForm);
      toast.success('Transaction details updated successfully.');
      setFormOpen(false);
      if (response.data?.transaction) {
        setTransaction(response.data.transaction);
      } else {
        await loadDetail();
      }
    } catch (requestError) {
      toast.error(errorMessage(requestError, 'Unable to update transaction.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async () => {
    if (!transaction) return;
    if (!window.confirm(`Are you sure you want to delete this transaction of ${moneyLabel(transaction.amount)}?`)) return;

    try {
      await api.delete(`/finance/transactions/${transaction.id}`);
      toast.success('Transaction deleted successfully.');
      router.push(listPath);
    } catch (requestError) {
      toast.error(errorMessage(requestError, 'Unable to delete transaction.'));
    }
  };

  const copyToClipboard = (textVal: string, name: string) => {
    void navigator.clipboard.writeText(textVal);
    toast.info(`${name} copied to clipboard`);
  };

  if (!hasHydrated || loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <BrandLoader />
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <button
          type="button"
          onClick={() => router.push(listPath)}
          className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Expenses & Transactions</span>
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <FileText className="mx-auto h-10 w-10 text-red-400" />
          <h3 className="mt-3 text-lg font-bold text-red-900">{error || 'Transaction details not found'}</h3>
          <p className="mt-1 text-sm text-red-600">The requested transaction ID may have been deleted or is inaccessible.</p>
        </div>
      </div>
    );
  }

  const isDebit = transaction.type === 'DEBIT';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Top Header / Back Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(listPath)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-900"
            title="Back to list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Transaction Details</h1>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isDebit ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {isDebit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                {transaction.type}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canUpdate ? (
            <button
              type="button"
              onClick={openEditModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-300 cursor-pointer"
            >
              <Pencil className="h-4 w-4" />
              <span>Edit Transaction</span>
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              onClick={() => void deleteTransaction()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-600 shadow-xs transition hover:bg-red-50 hover:border-red-300 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Amount</span>
            <div className={`text-3xl font-extrabold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>
              {isDebit ? '-' : '+'}{moneyLabel(transaction.amount)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
              <span className="font-semibold text-slate-700">{transaction.name}</span>
              <span>•</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600 font-medium">{transaction.category}</span>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-3 md:w-auto">
            <div>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Date</span>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{dateLabel(transaction.transactionDate)}</p>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Method</span>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{label(transaction.paymentMethod)}</p>
            </div>

            <div>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Account / Bank</span>
              <p className="text-xs font-bold text-slate-800 mt-0.5 truncate max-w-[120px]" title={transaction.accountName}>
                {transaction.accountName}
              </p>
            </div>

            {transaction.balance !== null ? (
              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Balance</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">{moneyLabel(transaction.balance)}</p>
              </div>
            ) : null}

            {transaction.valueDate ? (
              <div>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Value Date</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">{dateLabel(transaction.valueDate)}</p>
              </div>
            ) : null}

            <div>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Source</span>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{transaction.source}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Card 1: Main Transaction Information */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">Party & Category</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500 font-medium">Party / Payee Name</span>
              <span className="font-semibold text-slate-900 text-right">{transaction.name}</span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Category</span>
              <span className="inline-flex rounded-lg bg-amber-50 px-2.5 py-1 font-semibold text-amber-900">
                {transaction.category}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Payment Method</span>
              <span className="font-semibold text-slate-900">{label(transaction.paymentMethod)}</span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Account / Bank Name</span>
              <span className="font-semibold text-slate-900">{transaction.accountName}</span>
            </div>
          </div>
        </div>

        {/* Card 2: References & Financial Identifiers */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Receipt className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">Reference & Numbers</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Reference / UTR</span>
              {transaction.reference ? (
                <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                  <span>{transaction.reference}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(transaction.reference!, 'Reference UTR')}
                    className="text-slate-400 hover:text-amber-600 transition"
                    title="Copy UTR"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Cheque Number</span>
              <span className="font-mono font-semibold text-slate-900">{transaction.chequeNumber || '—'}</span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Invoice Number</span>
              <span className="font-mono font-semibold text-slate-900">{transaction.invoiceNumber || '—'}</span>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-50 pt-2.5">
              <span className="text-slate-500 font-medium">Entry Source</span>
              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                {transaction.source === 'IMPORT' ? 'Bank Import' : 'Manual Entry'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Full Narration & Notes */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3 md:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900">Narration & Notes</h2>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(transaction.narration, 'Narration')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 transition"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Copy Narration</span>
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500">Full Narration:</span>
              <p className="mt-1 rounded-xl bg-slate-50 p-3 font-mono text-slate-800 whitespace-pre-wrap break-words border border-slate-100">
                {transaction.narration}
              </p>
            </div>

            {transaction.notes ? (
              <div>
                <span className="font-semibold text-slate-500">Notes:</span>
                <p className="mt-1 rounded-xl bg-amber-50/50 p-3 text-slate-800 whitespace-pre-wrap break-words border border-amber-100">
                  {transaction.notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Card 4: Audit & System Metadata */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3 md:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900">Audit & System Information</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Record Created At</span>
              <p className="font-semibold text-slate-700 mt-0.5">{dateTimeLabel(transaction.createdAt)}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Last Updated At</span>
              <p className="font-semibold text-slate-700 mt-0.5">{dateTimeLabel(transaction.updatedAt)}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">System Transaction ID</span>
              <p className="font-mono text-slate-700 font-medium truncate mt-0.5" title={transaction.id}>
                {transaction.id}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Transaction</h3>
                <p className="text-xs text-slate-500">Update transaction values and narration</p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitEdit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Transaction Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.transactionDate}
                    onChange={(e) => updateForm('transactionDate', e.target.value)}
                    className={`${inputClass} mt-1`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Value Date</label>
                  <input
                    type="date"
                    value={form.valueDate}
                    onChange={(e) => updateForm('valueDate', e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Transaction Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => updateForm('type', e.target.value as FinanceType)}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="DEBIT">Debit (-)</option>
                    <option value="CREDIT">Credit (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amount}
                    onChange={(e) => updateForm('amount', e.target.value)}
                    placeholder="0.00"
                    className={`${inputClass} mt-1`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bank / Account Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.accountName}
                    onChange={(e) => updateForm('accountName', e.target.value)}
                    placeholder="MAIN ACCOUNT"
                    className={`${inputClass} mt-1 uppercase`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Party / Person Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="Vendor or Receiver Name"
                    className={`${inputClass} mt-1`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Payment Method</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => updateForm('paymentMethod', e.target.value as PaymentMethod)}
                    className={`${inputClass} mt-1`}
                  >
                    {paymentMethods.map((pm) => (
                      <option key={pm.value} value={pm.value}>
                        {pm.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Category</label>
                  <input
                    type="text"
                    list="detail-category-suggestions"
                    value={form.category}
                    onChange={(e) => updateForm('category', e.target.value)}
                    placeholder="Category name"
                    className={`${inputClass} mt-1`}
                  />
                  <datalist id="detail-category-suggestions">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Reference / UTR Number</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => updateForm('reference', e.target.value)}
                    placeholder="UTR / Ref Number"
                    className={`${inputClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Cheque Number</label>
                  <input
                    type="text"
                    value={form.chequeNumber}
                    onChange={(e) => updateForm('chequeNumber', e.target.value)}
                    placeholder="Cheque No."
                    className={`${inputClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Invoice Number</label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => updateForm('invoiceNumber', e.target.value)}
                    placeholder="Invoice No."
                    className={`${inputClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.balance}
                    onChange={(e) => updateForm('balance', e.target.value)}
                    placeholder="Optional balance"
                    className={`${inputClass} mt-1`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Narration <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.narration}
                  onChange={(e) => updateForm('narration', e.target.value)}
                  rows={3}
                  placeholder="Enter detailed narration"
                  className={`${inputClass} mt-1`}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  rows={2}
                  placeholder="Optional internal remarks"
                  className={`${inputClass} mt-1`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-300 disabled:opacity-50 transition cursor-pointer"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
