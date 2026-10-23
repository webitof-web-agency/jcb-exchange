/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { downloadTableFile } from '@/lib/tabularExport';
import { parseStatementText } from '@/lib/financeStatement.mjs';
import { sanitizeFinanceFieldValue, sanitizeFinanceFormData } from '@/lib/financeFormSanitizers';
import { filterFinanceExportRows, getFinanceExportData } from '@/lib/financeExport';
import { buildPaginationItems } from '@/lib/paginationUtils';
import BrandLoader from '@/components/ui/BrandLoader';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';
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

type ImportMeta = {
  bankName: string;
  accountName: string;
  statementFrom: string;
  statementTo: string;
  openingBalance: string;
  closingBalance: string;
};

type ExportFormat = 'csv' | 'xls';

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

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20';

const localDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const emptyForm = (): FinanceForm => ({
  transactionDate: localDate(),
  valueDate: '',
  type: 'DEBIT',
  amount: '',
  balance: '',
  accountName: '',
  paymentMethod: 'OTHER',
  name: '',
  category: 'Miscellaneous',
  narration: '',
  reference: '',
  chequeNumber: '',
  invoiceNumber: '',
  notes: '',
});

const emptyImportMeta = (): ImportMeta => ({
  bankName: '',
  accountName: '',
  statementFrom: '',
  statementTo: '',
  openingBalance: '',
  closingBalance: '',
});

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const dateLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : '—';
const dateInputValue = (value: string | null | undefined) => value ? value.slice(0, 10) : '';
const moneyLabel = (value: number | null | undefined) => value === null || value === undefined
  ? '—'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const errorMessage = (error: unknown, fallback: string) => {
  const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return responseError || fallback;
};

const importRowValue = (row: Record<string, string>, keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== '') || '';

function Field({ label: fieldLabel, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const required = fieldLabel.endsWith('*');
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {required ? fieldLabel.slice(0, -1).trim() : fieldLabel}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="my-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SelectField({
  value,
  options,
  onChange,
  placeholder,
  searchable = false,
  className = 'w-full',
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const allOptions = placeholder ? [{ value: '', label: placeholder }, ...options] : options;
  const selectedOption = allOptions.find((option) => option.value === value);
  const filteredOptions = allOptions.filter((option) => option.label.toLowerCase().includes(searchQuery.toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setSearchQuery('');
  };
  const toggleOpen = () => {
    if (isOpen) {
      close();
      return;
    }
    setIsOpen(true);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleOpen();
          }
        }}
        className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 text-left text-sm outline-none transition-all duration-150 focus:ring-2 focus:ring-amber-400/20 ${isOpen ? 'border-amber-400 bg-white shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-white'}`}
      >
        <span className={`truncate ${selectedOption?.value ? 'text-slate-900' : 'text-slate-500'}`}>{selectedOption?.label || placeholder || 'Select option'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-[90] mt-2 max-h-72 min-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)]">
          {searchable ? (
            <div className="sticky top-0 z-10 bg-white pb-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search options..."
                  aria-label="Search options"
                  autoFocus
                  className="w-full rounded-xl bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-slate-100"
                />
              </div>
            </div>
          ) : null}

          <div role="listbox" aria-label={placeholder || 'Select option'} className="space-y-0.5">
            {filteredOptions.length ? filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(option.value); close(); }}
                  className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors duration-150 ${isSelected ? 'bg-amber-50 font-bold text-slate-950' : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                </button>
              );
            }) : <p className="px-3 py-2.5 text-sm text-slate-500">No matching options</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const privileged = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const permissions = user?.permissions || [];
  const canManage = privileged || hasAnyPermission(permissions, ['finance.manage']);
  const canRead = canManage || hasAnyPermission(permissions, ['finance.read']);
  const canCreate = canManage;
  const canUpdate = canManage;
  const canDelete = canManage;
  const canImport = canManage;
  const canExport = canManage;

  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState(defaultCategories);
  const [summary, setSummary] = useState({ debit: 0, credit: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);

  useEffect(() => {
    if (!openPageSizeDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.rows-per-page-dropdown-container')) {
        setOpenPageSizeDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openPageSizeDropdown]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, typeFilter, methodFilter, categoryFilter, fromFilter, toFilter]);

  const totalItems = transactions.length;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalItems / pageSize)), [totalItems, pageSize]);

  const currentPageForView = useMemo(() => {
    if (currentPage > totalPages) return totalPages;
    return currentPage;
  }, [currentPage, totalPages]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPageForView - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, currentPageForView, pageSize]);

  const startItemIndex = useMemo(() => {
    if (totalItems === 0) return 0;
    return (currentPageForView - 1) * pageSize + 1;
  }, [totalItems, currentPageForView, pageSize]);

  const endItemIndex = useMemo(() => {
    return Math.min(currentPageForView * pageSize, totalItems);
  }, [totalItems, currentPageForView, pageSize]);

  const paginationItems = useMemo(
    () => buildPaginationItems(currentPageForView, totalPages),
    [currentPageForView, totalPages]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [form, setForm] = useState<FinanceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMeta, setImportMeta] = useState<ImportMeta>(emptyImportMeta);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const loadTransactions = useCallback(async (showLoader = true) => {
    if (!hasHydrated || !isAuthenticated || !canRead) return;
    try {
      if (showLoader) setLoading(true);
      setError('');
      const response = await api.get('/finance/transactions', {
        params: {
          q: query || undefined,
          type: typeFilter || undefined,
          paymentMethod: methodFilter || undefined,
          category: categoryFilter || undefined,
          from: fromFilter || undefined,
          to: toFilter || undefined,
        },
      });
      setTransactions(response.data?.transactions || []);
      setSummary(response.data?.summary || { debit: 0, credit: 0, net: 0 });
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load expense transactions.'));
    } finally {
      setLoading(false);
    }
  }, [canRead, categoryFilter, fromFilter, hasHydrated, isAuthenticated, methodFilter, query, toFilter, typeFilter]);

  useEffect(() => { void loadTransactions(); }, [loadTransactions]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !canRead) return;
    api.get('/finance/categories')
      .then((response) => setCategories(response.data?.categories?.length ? response.data.categories : defaultCategories))
      .catch(() => setCategories(defaultCategories));
  }, [canRead, hasHydrated, isAuthenticated]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (transaction: FinanceTransaction) => {
    setEditing(transaction);
    setForm(sanitizeFinanceFormData<FinanceForm>({
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
    }));
    setFormOpen(true);
  };

  const updateForm = (key: keyof FinanceForm, value: string) => setForm((current) => ({
    ...current,
    [key]: sanitizeFinanceFieldValue(key, value, { finalize: false }),
  }));
  const updateImportMeta = (key: keyof ImportMeta, value: string) => setImportMeta((current) => ({
    ...current,
    [key]: key === 'bankName' ? sanitizeFinanceFieldValue('accountName', value, { finalize: false }) : value,
  }));

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sanitizedForm = sanitizeFinanceFormData(form);
    setForm(sanitizedForm);
    if (!sanitizedForm.transactionDate || !sanitizedForm.amount || !Number.isFinite(Number(sanitizedForm.amount)) || Number(sanitizedForm.amount) <= 0 || !sanitizedForm.accountName.trim() || !sanitizedForm.name.trim() || !sanitizedForm.narration.trim()) {
      toast.error('Date, bank name, amount, name and narration are required.');
      return;
    }
    try {
      setSaving(true);
      const request = editing
        ? api.put(`/finance/transactions/${editing.id}`, sanitizedForm)
        : api.post('/finance/transactions', sanitizedForm);
      await request;
      toast.success(editing ? 'Transaction updated successfully.' : 'Transaction added successfully.');
      setFormOpen(false);
      await loadTransactions(false);
    } catch (requestError) {
      toast.error(errorMessage(requestError, 'Unable to save transaction.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (transaction: FinanceTransaction) => {
    if (!window.confirm(`Delete this ${transaction.type.toLowerCase()} transaction for ${moneyLabel(transaction.amount)}?`)) return;
    try {
      await api.delete(`/finance/transactions/${transaction.id}`);
      toast.success('Transaction deleted.');
      await loadTransactions(false);
    } catch (requestError) {
      toast.error(errorMessage(requestError, 'Unable to delete transaction.'));
    }
  };

  const handleStatementFile = async (file: File | undefined) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'tsv', 'txt'].includes(extension || '')) {
      setImportFile(null);
      setImportRows([]);
      setImportError('Please export the bank statement as CSV or TSV. Binary XLSX/PDF files are not accepted in this simple import flow.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError('Statement file must be 10 MB or smaller.');
      return;
    }
    try {
      const parsed = parseStatementText(await file.text());
      if (!parsed.rows.length) throw new Error('No data rows were found. Check that the first row contains column headings.');
      setImportFile(file);
      setImportRows(parsed.rows);
      setImportError('');
      toast.success(`${parsed.rows.length} statement rows ready to import.`);
    } catch (parseError) {
      setImportRows([]);
      setImportError(parseError instanceof Error ? parseError.message : 'Unable to read the statement file.');
    }
  };

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importFile || !importRows.length) {
      setImportError('Choose a valid CSV/TSV statement file first.');
      return;
    }
    try {
      setImporting(true);
      const response = await api.post('/finance/imports', {
        fileName: importFile.name,
        ...importMeta,
        rows: importRows,
      });
      const result = response.data || {};
      toast.success(`${result.importedRows || 0} rows imported; ${result.duplicateRows || 0} duplicates skipped.`);
      if (result.failedRows) toast.warn(`${result.failedRows} rows need review and were not imported.`);
      setImportOpen(false);
      setImportFile(null);
      setImportRows([]);
      setImportMeta(emptyImportMeta());
      await loadTransactions(false);
    } catch (requestError) {
      setImportError(errorMessage(requestError, 'Unable to import statement.'));
    } finally {
      setImporting(false);
    }
  };

  const exportColumns = useMemo(() => [
    { header: 'Transaction ID', value: (row: FinanceTransaction) => getFinanceExportData(row).transactionId },
    { header: 'Transaction Date', value: (row: FinanceTransaction) => dateLabel(getFinanceExportData(row).transactionDate) },
    { header: 'Value Date', value: (row: FinanceTransaction) => row.valueDate ? dateLabel(row.valueDate) : '' },
    { header: 'Type', value: (row: FinanceTransaction) => label(row.type) },
    { header: 'Amount', value: (row: FinanceTransaction) => getFinanceExportData(row).amount },
    { header: 'Closing Balance', value: (row: FinanceTransaction) => getFinanceExportData(row).balance },
    { header: 'Bank Name', value: (row: FinanceTransaction) => getFinanceExportData(row).bankName },
    { header: 'Name / Party', value: (row: FinanceTransaction) => getFinanceExportData(row).name },
    { header: 'Category', value: (row: FinanceTransaction) => getFinanceExportData(row).category },
    { header: 'Payment Method', value: (row: FinanceTransaction) => label(row.paymentMethod) },
    { header: 'Narration', value: (row: FinanceTransaction) => getFinanceExportData(row).narration },
    { header: 'UTR / Reference', value: (row: FinanceTransaction) => getFinanceExportData(row).reference },
    { header: 'Cheque Number', value: (row: FinanceTransaction) => getFinanceExportData(row).chequeNumber },
    { header: 'Invoice Number', value: (row: FinanceTransaction) => getFinanceExportData(row).invoiceNumber },
    { header: 'Notes', value: (row: FinanceTransaction) => getFinanceExportData(row).notes },
    { header: 'Source', value: (row: FinanceTransaction) => label(row.source) },
  ], []);

  const exportTransactions = (format: ExportFormat) => {
    if (fromFilter && toFilter && fromFilter > toFilter) {
      toast.error('From date cannot be later than To date.');
      return;
    }
    const exportRows = filterFinanceExportRows(transactions, fromFilter, toFilter);
    if (!exportRows.length) {
      toast.info('There are no transactions to export.');
      return;
    }
    downloadTableFile({
      columns: exportColumns,
      rows: exportRows,
      fileName: `jcb-expenses-${localDate()}`,
      format,
    });
  };

  if (!hasHydrated || loading) return <BrandLoader variant="section" size="md" bg="light" />;

  if (!canRead) {
    return <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">You do not have permission to access expenses.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadTransactions(false)} className="font-semibold underline">Retry</button></div> : null}

      {/* 1. 3 Summary Cards at the very TOP */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Total debit</span>
            <ArrowUpRight className="h-5 w-5 text-red-500" />
          </div>
          <p className="mt-2 text-xl font-bold text-red-600">{moneyLabel(summary.debit)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Total credit</span>
            <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-600">{moneyLabel(summary.credit)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Net movement</span>
            <WalletCards className="h-5 w-5 text-amber-500" />
          </div>
          <p className={`mt-2 text-xl font-bold ${summary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {moneyLabel(summary.net)}
          </p>
        </div>
      </div>

      {/* 2. Main Table Card with Clean 2-Row Aligned Header */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Row 1: Search, Category/Method Filters & Action Buttons */}
        <div className="flex flex-col gap-3.5 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, narration, UTR..."
                className={`${inputClass} pl-9 text-xs py-2 w-full`}
              />
            </div>

            {/* Select Filters: Grid on small mobile screens, flex on sm+ */}
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center">
              <SelectField
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="All types"
                className="w-full sm:w-[125px]"
                options={[
                  { value: 'DEBIT', label: 'Debit' },
                  { value: 'CREDIT', label: 'Credit' },
                ]}
              />

              <SelectField
                value={methodFilter}
                onChange={setMethodFilter}
                placeholder="All methods"
                className="w-full sm:w-[145px]"
                searchable
                options={paymentMethods}
              />

              <SelectField
                value={categoryFilter}
                onChange={setCategoryFilter}
                placeholder="All categories"
                className="col-span-2 w-full sm:col-span-1 sm:w-[160px]"
                searchable
                options={categories.map((item) => ({ value: item, label: item }))}
              />
            </div>
          </div>

          {/* Action Buttons: Import, Export, + Add */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-2 lg:pt-0 border-t border-slate-100 lg:border-t-0">
            {canImport ? (
              <button
                type="button"
                onClick={() => {
                  setImportError('');
                  setImportOpen(true);
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-amber-400 hover:text-slate-900 cursor-pointer"
              >
                <Upload className="h-4 w-4 text-slate-500" />
                <span>Import</span>
              </button>
            ) : null}

            {canExport ? (
              <PortalActionDropdown
                align="right"
                trigger={
                  <div className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-amber-400 hover:text-slate-900 cursor-pointer">
                    <Download className="h-4 w-4 text-amber-600" />
                    <span>Export</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                }
                items={[
                  {
                    label: 'Export as CSV (.csv)',
                    icon: <Download className="h-4 w-4 text-slate-600" />,
                    onClick: () => exportTransactions('csv'),
                  },
                  {
                    label: 'Export as Excel (.xls)',
                    icon: <FileSpreadsheet className="h-4 w-4 text-emerald-600" />,
                    onClick: () => exportTransactions('xls'),
                  },
                ]}
              />
            ) : null}

            {canCreate ? (
              <button
                type="button"
                onClick={openCreate}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 sm:py-2 text-xs font-bold text-slate-950 shadow-xs transition hover:bg-amber-300 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Row 2: Date Range Filter Sub-Bar & Record Count */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Date range</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-[240px] sm:min-w-0 sm:flex-none">
              <div className="relative flex-1 sm:w-[135px]">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={fromFilter}
                  onChange={(event) => setFromFilter(event.target.value)}
                  className={`${inputClass} pl-9 text-xs py-1.5 w-full bg-white`}
                  aria-label="From date"
                />
              </div>
              <span className="text-xs text-slate-400 font-medium shrink-0">to</span>
              <div className="relative flex-1 sm:w-[135px]">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={toFilter}
                  onChange={(event) => setToFilter(event.target.value)}
                  className={`${inputClass} pl-9 text-xs py-1.5 w-full bg-white`}
                  aria-label="To date"
                />
              </div>
            </div>

            {(query || typeFilter || methodFilter || categoryFilter || fromFilter || toFilter) ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setTypeFilter('');
                  setMethodFilter('');
                  setCategoryFilter('');
                  setFromFilter('');
                  setToFilter('');
                }}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition cursor-pointer shrink-0"
              >
                Clear
              </button>
            ) : null}
          </div>

          <span className="text-xs font-medium text-slate-500 self-end sm:self-auto">
            {totalItems} record{totalItems === 1 ? '' : 's'}
          </span>
        </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Narration</th>
                  <th className="px-4 py-3 font-semibold">Balance</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTransactions.map((transaction) => {
                  const actions = [
                    { label: 'View Details', icon: <Eye className="h-4 w-4 text-blue-600" />, onClick: () => router.push(`${pathname}/${transaction.id}`) },
                    canUpdate ? { label: 'Edit Transaction', icon: <Pencil className="h-4 w-4 text-amber-600" />, onClick: () => openEdit(transaction) } : null,
                    canDelete ? { label: 'Delete Transaction', icon: <Trash2 className="h-4 w-4 text-red-500" />, onClick: () => void deleteTransaction(transaction), variant: 'danger' as const } : null,
                  ].filter(Boolean) as Array<{ label: string; icon: React.ReactNode; onClick: () => void; variant?: 'danger' }>;
                  return (
                    <tr
                      key={transaction.id}
                      onClick={() => router.push(`${pathname}/${transaction.id}`)}
                      className="transition hover:bg-amber-50/40 cursor-pointer"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{dateLabel(transaction.transactionDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${transaction.type === 'DEBIT' ? 'bg-red-50 text-red-700' : transaction.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                          {label(transaction.type)}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 font-bold ${transaction.type === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {transaction.type === 'DEBIT' ? '-' : '+'}{moneyLabel(transaction.amount)}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-semibold text-slate-800 hover:text-amber-600 transition" title={transaction.name}>{transaction.name}</td>
                      <td className="max-w-[150px] truncate px-4 py-3 text-slate-600" title={transaction.category}>{transaction.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{label(transaction.paymentMethod)}</td>
                      <td className="max-w-[280px] truncate px-4 py-3 text-slate-600" title={transaction.narration}>{transaction.narration}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{moneyLabel(transaction.balance)}</td>
                      <td className="px-4 py-3 text-right">
                        <div onClick={(e) => e.stopPropagation()}>
                          {actions.length ? <PortalActionDropdown align="right" items={actions} /> : <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!paginatedTransactions.length ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <FileText className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-3 font-semibold text-slate-700">No transactions found</p>
                      <p className="mt-1 text-sm text-slate-500">Add a transaction or import a bank statement to begin.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
              <div>
                Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                <span className="font-bold text-gray-900">{totalItems}</span> records
              </div>

              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <div className="relative rows-per-page-dropdown-container">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenPageSizeDropdown((prev) => !prev);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  >
                    <span>{pageSize}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </button>

                  {openPageSizeDropdown ? (
                    <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {[5, 10, 25, 50].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPageSize(size);
                            setCurrentPage(1);
                            setOpenPageSizeDropdown(false);
                          }}
                          className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                            pageSize === size ? 'bg-[#FFC107]/20 font-extrabold text-gray-900' : 'font-medium text-gray-700'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1 sm:justify-end">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPageForView === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {paginationItems.map((item, index) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                        currentPageForView === item ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`ellipsis-${index}`} className="px-1 text-xs font-bold text-gray-400">
                      ...
                    </span>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPageForView === totalPages || totalPages === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

      {formOpen ? <Modal title={editing ? 'Edit Transaction' : 'Add Transaction'} subtitle="Keep the entry clear enough for later reconciliation and export." onClose={() => { if (!saving) setFormOpen(false); }}><form onSubmit={submitForm} className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5 sm:p-7"><div className="grid gap-4 md:grid-cols-3"><Field label="Transaction date *"><input type="date" value={form.transactionDate} onChange={(event) => updateForm('transactionDate', event.target.value)} className={inputClass} required /></Field><Field label="Debit / Credit *"><SelectField value={form.type} onChange={(value) => updateForm('type', value)} options={[{ value: 'DEBIT', label: 'Debit / Expense' }, { value: 'CREDIT', label: 'Credit / Income' }]} /></Field><Field label="Amount *"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} className={inputClass} placeholder="0.00" required /></Field><Field label="Closing balance"><input type="number" step="0.01" value={form.balance} onChange={(event) => updateForm('balance', event.target.value)} className={inputClass} placeholder="Optional" /></Field><Field label="Bank name *"><input value={form.accountName} onChange={(event) => updateForm('accountName', event.target.value)} className={`${inputClass} uppercase`} placeholder="HDFC BANK" required /></Field><Field label="Name / party *"><input value={form.name} onChange={(event) => updateForm('name', event.target.value)} className={inputClass} placeholder="Vendor, customer or employee" required /></Field><Field label="Category"><SelectField value={form.category} onChange={(value) => updateForm('category', value)} searchable options={categories.map((item) => ({ value: item, label: item }))} /></Field><Field label="Payment method"><SelectField value={form.paymentMethod} onChange={(value) => updateForm('paymentMethod', value)} searchable options={paymentMethods} /></Field><Field label="Narration *" wide><textarea value={form.narration} onChange={(event) => updateForm('narration', event.target.value)} className={`${inputClass} min-h-20 resize-y`} placeholder="Why was this transaction made?" required /></Field><Field label="UTR / reference"><input value={form.reference} onChange={(event) => updateForm('reference', event.target.value)} className={inputClass} /></Field><Field label="Cheque number"><input value={form.chequeNumber} onChange={(event) => updateForm('chequeNumber', event.target.value)} className={inputClass} /></Field><Field label="Invoice number"><input value={form.invoiceNumber} onChange={(event) => updateForm('invoiceNumber', event.target.value)} className={inputClass} /></Field><Field label="Notes" wide><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} className={`${inputClass} min-h-20 resize-y`} placeholder="Optional internal note" /></Field></div><div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editing ? 'Update Transaction' : 'Save Transaction'}</button></div></form></Modal> : null}

      {importOpen ? <Modal title="Import Bank Statement" subtitle="CSV/TSV import supports date, narration, debit, credit, balance and reference columns." onClose={() => { if (!importing) setImportOpen(false); }}><form onSubmit={submitImport} className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5 sm:p-7"><div className="grid gap-4 md:grid-cols-3"><Field label="Bank name"><input value={importMeta.bankName} onChange={(event) => updateImportMeta('bankName', event.target.value)} className={`${inputClass} uppercase`} placeholder="HDFC BANK" /></Field><Field label="Statement file *"><label className={`${inputClass} flex cursor-pointer items-center gap-2`}><FileSpreadsheet className="h-4 w-4 text-emerald-600" /><span className="min-w-0 flex-1 truncate text-slate-600">{importFile?.name || 'Choose CSV / TSV file'}</span><input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(event) => { void handleStatementFile(event.target.files?.[0]); event.target.value = ''; }} /></label></Field><Field label="Statement from"><input type="date" value={importMeta.statementFrom} onChange={(event) => updateImportMeta('statementFrom', event.target.value)} className={inputClass} /></Field><Field label="Statement to"><input type="date" value={importMeta.statementTo} onChange={(event) => updateImportMeta('statementTo', event.target.value)} className={inputClass} /></Field><Field label="Opening balance"><input type="number" step="0.01" value={importMeta.openingBalance} onChange={(event) => updateImportMeta('openingBalance', event.target.value)} className={inputClass} /></Field><Field label="Closing balance"><input type="number" step="0.01" value={importMeta.closingBalance} onChange={(event) => updateImportMeta('closingBalance', event.target.value)} className={inputClass} /></Field></div>{importError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{importError}</div> : null}{importRows.length ? <div className="mt-5 rounded-xl border border-slate-200"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-bold text-slate-800">Preview</p><p className="text-xs text-slate-500">{importRows.length} rows detected. Existing duplicate rows will be skipped.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Ready</span></div><div className="max-h-64 overflow-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Narration</th><th className="px-3 py-2">Debit</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Balance</th><th className="px-3 py-2">Reference</th></tr></thead><tbody className="divide-y divide-slate-100">{importRows.slice(0, 25).map((row, index) => <tr key={`${index}-${row.date || ''}`}><td className="px-3 py-2">{importRowValue(row, ['date', 'valueDate']) || '—'}</td><td className="max-w-[260px] truncate px-3 py-2" title={importRowValue(row, ['narration'])}>{importRowValue(row, ['narration']) || '—'}</td><td className="px-3 py-2 text-red-600">{importRowValue(row, ['withdrawal', 'debit']) || '—'}</td><td className="px-3 py-2 text-emerald-600">{importRowValue(row, ['deposit', 'credit']) || '—'}</td><td className="px-3 py-2">{importRowValue(row, ['closing balance', 'balance', 'available balance']) || '—'}</td><td className="px-3 py-2">{importRowValue(row, ['reference']) || '—'}</td></tr>)}</tbody></table></div></div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><Landmark className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">Select a bank statement to preview it here</p><p className="mt-1 text-xs text-slate-500">The first row must contain headings such as Date, Narration, Withdrawal, Deposit and Closing Balance.</p></div>}<div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setImportOpen(false)} disabled={importing} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={importing || !importRows.length} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {importRows.length ? `${importRows.length} Rows` : 'Statement'}</button></div></form></Modal> : null}
    </div>
  );
}
