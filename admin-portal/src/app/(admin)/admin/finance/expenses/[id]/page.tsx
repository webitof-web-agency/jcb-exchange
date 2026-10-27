/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { sanitizeFinanceFieldValue, sanitizeFinanceFormData } from '@/lib/financeFormSanitizers';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';
import FinancePageHeader from '@/components/financeWorkspace/FinancePageHeader';
import { Badge, Button, Field, inputClass, Modal, ModalFooter } from '@/components/financeWorkspace/ui';

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
      <div className="space-y-3">
        <FinancePageHeader actions={<Button icon={<ArrowLeft />} onClick={() => router.push(listPath)}>Back to list</Button>} />
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-[13px] font-medium text-red-900">{error || 'Transaction details not found'}</p>
          <p className="mt-0.5 text-[12px] text-red-700">The transaction may have been deleted or is not accessible to your role.</p>
        </div>
      </div>
    );
  }

  const isDebit = transaction.type === 'DEBIT';
  const copyButton = (value: string, name: string) => (
    <button type="button" onClick={() => copyToClipboard(value, name)} className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-amber-600" title={`Copy ${name}`}>
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
  const details: Array<[string, ReactNode]> = [
    ['Party / payee', <span key="name" className="font-medium text-slate-900">{transaction.name}</span>],
    ['Category', <Badge key="category" tone="amber">{transaction.category}</Badge>],
    ['Payment method', label(transaction.paymentMethod)],
    ['Bank / account', transaction.accountName],
    ['Transaction date', dateLabel(transaction.transactionDate)],
    ['Value date', dateLabel(transaction.valueDate)],
    ['Reference / UTR', transaction.reference ? <span key="ref" className="inline-flex items-center gap-1 font-mono text-[12px]">{transaction.reference}{copyButton(transaction.reference, 'reference')}</span> : '—'],
    ['Cheque number', <span key="cheque" className="font-mono text-[12px]">{transaction.chequeNumber || '—'}</span>],
    ['Invoice number', <span key="invoice" className="font-mono text-[12px]">{transaction.invoiceNumber || '—'}</span>],
    ['Entry source', transaction.source === 'IMPORT' ? 'Bank import' : 'Manual entry'],
  ];

  return (
    <div className="space-y-3 tabular-nums">
      <FinancePageHeader
        actions={(
          <>
            <Button icon={<ArrowLeft />} onClick={() => router.push(listPath)}>Back</Button>
            {canDelete ? <Button variant="danger" icon={<Trash2 />} onClick={() => void deleteTransaction()}>Delete</Button> : null}
            {canUpdate ? <Button variant="primary" icon={<Pencil />} onClick={openEditModal}>Edit</Button> : null}
          </>
        )}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h2 className="flex h-10 items-center border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-900">Details</h2>
            <dl className="grid sm:grid-cols-2">
              {details.map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-[13px] sm:odd:border-r">
                  <dt className="shrink-0 text-[12px] text-slate-500">{term}</dt>
                  <dd className="min-w-0 truncate text-right text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex h-10 items-center justify-between border-b border-slate-100 px-3">
              <h2 className="text-[13px] font-semibold text-slate-900">Narration & notes</h2>
              <button type="button" onClick={() => copyToClipboard(transaction.narration, 'Narration')} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-700 hover:underline"><Copy className="h-3.5 w-3.5" />Copy narration</button>
            </div>
            <div className="space-y-3 p-3">
              <p className="whitespace-pre-wrap break-words rounded-md bg-slate-50 px-3 py-2 font-mono text-[12px] leading-5 text-slate-800">{transaction.narration}</p>
              {transaction.notes ? (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-slate-500">Notes</p>
                  <p className="whitespace-pre-wrap break-words rounded-md border border-amber-100 bg-amber-50/50 px-3 py-2 text-[13px] text-slate-800">{transaction.notes}</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-slate-500">Amount</p>
              <Badge tone={isDebit ? 'red' : 'green'}>{isDebit ? <ArrowDownLeft className="mr-0.5 h-3 w-3" /> : <ArrowUpRight className="mr-0.5 h-3 w-3" />}{label(transaction.type)}</Badge>
            </div>
            <p className={`mt-1 text-[18px] font-semibold ${isDebit ? 'text-red-700' : 'text-emerald-700'}`}>{isDebit ? '−' : '+'}{moneyLabel(transaction.amount)}</p>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[13px]">
              <span className="text-[12px] text-slate-500">Closing balance</span>
              <span className="font-medium text-slate-900">{moneyLabel(transaction.balance)}</span>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h2 className="flex h-10 items-center gap-1.5 border-b border-slate-100 px-3 text-[13px] font-semibold text-slate-900"><Clock className="h-3.5 w-3.5 text-slate-400" />Audit</h2>
            <dl className="divide-y divide-slate-100 text-[13px]">
              <div className="flex justify-between gap-3 px-3 py-2"><dt className="text-[12px] text-slate-500">Created</dt><dd className="text-slate-700">{dateTimeLabel(transaction.createdAt)}</dd></div>
              <div className="flex justify-between gap-3 px-3 py-2"><dt className="text-[12px] text-slate-500">Last updated</dt><dd className="text-slate-700">{dateTimeLabel(transaction.updatedAt)}</dd></div>
              <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="shrink-0 text-[12px] text-slate-500">Record ID</dt><dd className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-slate-600"><span className="truncate" title={transaction.id}>{transaction.id}</span>{copyButton(transaction.id, 'record ID')}</dd></div>
            </dl>
          </section>
        </div>
      </div>

      {formOpen ? (
        <Modal title="Edit transaction" subtitle="Update transaction values and narration." onClose={() => { if (!saving) setFormOpen(false); }}>
          <form onSubmit={submitEdit} className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Transaction date *"><input type="date" value={form.transactionDate} onChange={(e) => updateForm('transactionDate', e.target.value)} className={inputClass} required /></Field>
              <Field label="Value date"><input type="date" value={form.valueDate} onChange={(e) => updateForm('valueDate', e.target.value)} className={inputClass} /></Field>
              <Field label="Transaction type *">
                <select value={form.type} onChange={(e) => updateForm('type', e.target.value as FinanceType)} className={inputClass}>
                  <option value="DEBIT">Debit (−)</option>
                  <option value="CREDIT">Credit (+)</option>
                </select>
              </Field>
              <Field label="Amount (₹) *"><input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => updateForm('amount', e.target.value)} placeholder="0.00" className={inputClass} required /></Field>
              <Field label="Balance (₹)"><input type="number" step="0.01" value={form.balance} onChange={(e) => updateForm('balance', e.target.value)} placeholder="Optional" className={inputClass} /></Field>
              <Field label="Bank / account name *"><input type="text" value={form.accountName} onChange={(e) => updateForm('accountName', e.target.value)} placeholder="MAIN ACCOUNT" className={`${inputClass} uppercase`} required /></Field>
              <Field label="Party / person name *"><input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="Vendor or receiver name" className={inputClass} required /></Field>
              <Field label="Payment method">
                <select value={form.paymentMethod} onChange={(e) => updateForm('paymentMethod', e.target.value as PaymentMethod)} className={inputClass}>
                  {paymentMethods.map((pm) => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <input type="text" list="detail-category-suggestions" value={form.category} onChange={(e) => updateForm('category', e.target.value)} placeholder="Category name" className={inputClass} />
                <datalist id="detail-category-suggestions">{categories.map((cat) => <option key={cat} value={cat} />)}</datalist>
              </Field>
              <Field label="Reference / UTR"><input type="text" value={form.reference} onChange={(e) => updateForm('reference', e.target.value)} placeholder="UTR / ref number" className={inputClass} /></Field>
              <Field label="Cheque number"><input type="text" value={form.chequeNumber} onChange={(e) => updateForm('chequeNumber', e.target.value)} placeholder="Cheque no." className={inputClass} /></Field>
              <Field label="Invoice number"><input type="text" value={form.invoiceNumber} onChange={(e) => updateForm('invoiceNumber', e.target.value)} placeholder="Invoice no." className={inputClass} /></Field>
              <div className="md:col-span-3"><Field label="Narration *"><textarea value={form.narration} onChange={(e) => updateForm('narration', e.target.value)} rows={3} placeholder="Enter detailed narration" className={inputClass} required /></Field></div>
              <div className="md:col-span-3"><Field label="Notes"><textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} rows={2} placeholder="Optional internal remarks" className={inputClass} /></Field></div>
            </div>
            <ModalFooter>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" busy={saving} icon={<Check />}>Save changes</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
