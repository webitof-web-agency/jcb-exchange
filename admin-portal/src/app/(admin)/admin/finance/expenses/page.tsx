/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
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
import Link from 'next/link';
import { useRequestedNew } from '@/lib/financeWorkspaceClient';
import { financeModulePath, financePortalPrefix } from '@/lib/financeWorkspace';
import FinancePageHeader from '@/components/financeWorkspace/FinancePageHeader';
import { Badge, Button, buttonLinkClass, DatePresets, Field, inputClass, Modal, ModalFooter, tableHeadClass } from '@/components/financeWorkspace/ui';

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

// Where each entry stands in the books (GET /finance-hub/posting/source-status).
type BookState = 'IN_BOOKS' | 'DRAFT' | 'QUEUED' | 'NEEDS_ATTENTION' | 'NOT_IN_BOOKS';
type BookStatus = { enabled: boolean; postingMode: string; items: Record<string, { state: BookState; voucherNumber: string | null; error: string | null }> };
const bookBadge: Record<BookState, { label: string; tone: 'green' | 'amber' | 'blue' | 'red' | 'slate' }> = {
  IN_BOOKS: { label: 'In books', tone: 'green' },
  DRAFT: { label: 'Draft voucher', tone: 'amber' },
  QUEUED: { label: 'Queued', tone: 'blue' },
  NEEDS_ATTENTION: { label: 'Needs mapping', tone: 'red' },
  NOT_IN_BOOKS: { label: 'Not in books', tone: 'slate' },
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

const PAGE_SIZES = [25, 50, 100];

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
        className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg border bg-slate-50 px-2.5 text-left text-[13px] outline-none transition focus:ring-2 focus:ring-amber-400/20 ${isOpen ? 'border-amber-400 bg-white' : 'border-slate-200 hover:border-slate-300 hover:bg-white'}`}
      >
        <span className={`truncate ${selectedOption?.value ? 'text-slate-900' : 'text-slate-500'}`}>{selectedOption?.label || placeholder || 'Select option'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-[90] mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {searchable ? (
            <div className="sticky top-0 z-10 bg-white pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search options..."
                  aria-label="Search options"
                  autoFocus
                  className="h-8 w-full rounded-md bg-slate-50 pl-8 pr-2 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:bg-slate-100"
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
                  className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors duration-150 ${isSelected ? 'bg-amber-50 font-medium text-slate-950' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
                </button>
              );
            }) : <p className="px-2.5 py-2 text-[13px] text-slate-500">No matching options</p>}
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
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

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

  const requestedNew = useRequestedNew(canCreate ? ['1'] : []);
  const [formOpen, setFormOpen] = useState(Boolean(requestedNew));
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

  // Book status for the rows on screen. Hidden when the user cannot read the finance books.
  const [bookStatus, setBookStatus] = useState<BookStatus | null>(null);
  const visibleIds = paginatedTransactions.filter((row) => row.source === 'MANUAL').map((row) => row.id).join(',');
  useEffect(() => {
    if (!visibleIds) return;
    let cancelled = false;
    api.get('/finance-hub/posting/source-status', { params: { sourceType: 'FINANCE_TRANSACTION', ids: visibleIds } })
      .then((response) => { if (!cancelled) setBookStatus(response.data as BookStatus); })
      .catch(() => { if (!cancelled) setBookStatus(null); });
    return () => { cancelled = true; };
  }, [visibleIds]);
  const prefix = financePortalPrefix(pathname);

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
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] font-medium text-red-700">You do not have permission to access expenses.</div>;
  }

  const hasFilters = Boolean(query || typeFilter || methodFilter || categoryFilter || fromFilter || toFilter);
  const kpis: Array<[string, string, string]> = [
    ['Total debit', moneyLabel(summary.debit), 'text-red-700'],
    ['Total credit', moneyLabel(summary.credit), 'text-emerald-700'],
    ['Net movement', moneyLabel(summary.net), summary.net >= 0 ? 'text-emerald-700' : 'text-red-700'],
    ['Records', String(totalItems), 'text-slate-900'],
  ];

  return (
    <div className="space-y-3 tabular-nums">
      <FinancePageHeader
        page={{ href: pathname, label: 'Expenses & Transactions', group: 'Expenses & Assets' }}
        actions={(
          <>
            {canImport ? <Button icon={<Upload />} onClick={() => { setImportError(''); setImportOpen(true); }}>Import</Button> : null}
            {canExport ? (
              <PortalActionDropdown
                align="right"
                trigger={<span className={buttonLinkClass('secondary')}><Download className="h-3.5 w-3.5 text-amber-600" />Export<ChevronDown className="h-3.5 w-3.5 text-slate-400" /></span>}
                items={[
                  { label: 'Export as CSV (.csv)', icon: <Download className="h-4 w-4 text-slate-600" />, onClick: () => exportTransactions('csv') },
                  { label: 'Export as Excel (.xls)', icon: <FileSpreadsheet className="h-4 w-4 text-emerald-600" />, onClick: () => exportTransactions('xls') },
                ]}
              />
            ) : null}
            {canCreate ? <Button variant="primary" icon={<Plus />} onClick={openCreate}>Add transaction</Button> : null}
          </>
        )}
      />

      {error ? <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"><span>{error}</span><button type="button" onClick={() => void loadTransactions(false)} className="font-medium underline">Retry</button></div> : null}

      <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12px] leading-5 text-slate-700">
        Expenses entered here are <b className="font-semibold">paid</b> expenses and go into the books automatically{bookStatus && !bookStatus.enabled ? ' once automatic posting is on' : ''}.
        For a bill you will pay later or one with GST input credit, use <Link href={financeModulePath(prefix, 'vendor-bills')} className="font-medium text-blue-700 hover:underline">Vendor Bills</Link> instead — do not enter the same expense in both.
        Imported bank statement lines are matched in <Link href={financeModulePath(prefix, 'bank-reconciliation')} className="font-medium text-blue-700 hover:underline">Bank Reconciliation</Link>.
      </p>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4">
        {kpis.map(([title, value, tone]) => (
          <div key={title} className="bg-white px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500">{title}</p>
            <p className={`mt-0.5 truncate text-[15px] font-semibold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, narration, UTR…" className={`${inputClass} pl-8`} />
          </div>
          <SelectField value={typeFilter} onChange={setTypeFilter} placeholder="All types" className="w-[calc(50%-4px)] sm:w-28" options={[{ value: 'DEBIT', label: 'Debit' }, { value: 'CREDIT', label: 'Credit' }]} />
          <SelectField value={methodFilter} onChange={setMethodFilter} placeholder="All methods" className="w-[calc(50%-4px)] sm:w-36" searchable options={paymentMethods} />
          <SelectField value={categoryFilter} onChange={setCategoryFilter} placeholder="All categories" className="w-full sm:w-44" searchable options={categories.map((item) => ({ value: item, label: item }))} />
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <input type="date" value={fromFilter} onChange={(event) => setFromFilter(event.target.value)} className={`${inputClass} sm:w-[136px]`} aria-label="From date" />
            <span className="text-[12px] text-slate-400">to</span>
            <input type="date" value={toFilter} onChange={(event) => setToFilter(event.target.value)} className={`${inputClass} sm:w-[136px]`} aria-label="To date" />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <DatePresets from={fromFilter} to={toFilter} onSelect={(range) => { setFromFilter(range.from); setToFilter(range.to); }} />
            {hasFilters ? (
              <button type="button" onClick={() => { setQuery(''); setTypeFilter(''); setMethodFilter(''); setCategoryFilter(''); setFromFilter(''); setToFilter(''); }} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" />Clear</button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Narration</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                {bookStatus ? <th className="px-3 py-2 font-medium">Books</th> : null}
                <th className="w-12 px-3 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.map((transaction) => {
                const actions = [
                  { label: 'View details', icon: <Eye className="h-4 w-4 text-blue-600" />, onClick: () => router.push(`${pathname}/${transaction.id}`) },
                  canUpdate ? { label: 'Edit transaction', icon: <Pencil className="h-4 w-4 text-amber-600" />, onClick: () => openEdit(transaction) } : null,
                  canDelete ? { label: 'Delete transaction', icon: <Trash2 className="h-4 w-4 text-red-500" />, onClick: () => void deleteTransaction(transaction), variant: 'danger' as const } : null,
                ].filter(Boolean) as Array<{ label: string; icon: React.ReactNode; onClick: () => void; variant?: 'danger' }>;
                const debit = transaction.type === 'DEBIT';
                return (
                  <tr key={transaction.id} onClick={() => router.push(`${pathname}/${transaction.id}`)} className="h-9 cursor-pointer transition hover:bg-amber-50/40">
                    <td className="whitespace-nowrap px-3 text-slate-700">{dateLabel(transaction.transactionDate)}</td>
                    <td className="px-3"><Badge tone={debit ? 'red' : 'green'}>{label(transaction.type)}</Badge>{transaction.source === 'IMPORT' ? <span className="ml-1 text-[11px] text-blue-600">Imported</span> : null}</td>
                    <td className="max-w-[180px] truncate px-3 font-medium text-slate-900" title={transaction.name}>{transaction.name}</td>
                    <td className="max-w-[150px] truncate px-3 text-slate-600" title={transaction.category}>{transaction.category}</td>
                    <td className="whitespace-nowrap px-3 text-slate-600">{label(transaction.paymentMethod)}</td>
                    <td className="max-w-[300px] truncate px-3 text-slate-600" title={transaction.narration}>{transaction.narration}</td>
                    <td className={`whitespace-nowrap px-3 text-right font-semibold ${debit ? 'text-red-700' : 'text-emerald-700'}`}>{debit ? '−' : '+'}{moneyLabel(transaction.amount)}</td>
                    <td className="whitespace-nowrap px-3 text-right text-slate-600">{moneyLabel(transaction.balance)}</td>
                    {bookStatus ? (
                      <td className="whitespace-nowrap px-3" onClick={(event) => event.stopPropagation()}>
                        {transaction.source === 'IMPORT' ? <span className="text-[11px] text-slate-500">Bank statement</span> : (() => {
                          const item = bookStatus.items[transaction.id];
                          if (!item) return <span className="text-[11px] text-slate-400">—</span>;
                          const badge = bookBadge[item.state];
                          if (item.state === 'NEEDS_ATTENTION') {
                            return <Link href={financeModulePath(prefix, 'account-ledger-masters')} title={item.error ?? undefined}><Badge tone={badge.tone}>{badge.label}</Badge></Link>;
                          }
                          return <span title={item.voucherNumber ?? undefined}><Badge tone={badge.tone}>{item.voucherNumber ?? badge.label}</Badge></span>;
                        })()}
                      </td>
                    ) : null}
                    <td className="px-3 text-right">
                      <div onClick={(event) => event.stopPropagation()}>
                        {actions.length ? <PortalActionDropdown align="right" items={actions} /> : <span className="text-[12px] text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!paginatedTransactions.length ? (
                <tr>
                  <td colSpan={bookStatus ? 10 : 9} className="px-3 py-10 text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-[13px] font-medium text-slate-700">No transactions found</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{hasFilters ? 'Nothing matches these filters.' : 'Add a transaction or import a bank statement to begin.'}</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-3 py-2 text-[12px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span><span className="font-medium text-slate-900">{startItemIndex}–{endItemIndex}</span> of <span className="font-medium text-slate-900">{totalItems}</span></span>
            <label className="flex items-center gap-1.5">
              Rows
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[12px] text-slate-900 outline-none focus:border-amber-400">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center justify-center gap-1 sm:justify-end">
            <button type="button" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPageForView === 1} className="inline-flex h-7 items-center rounded-md px-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            {paginationItems.map((item, index) => (typeof item === 'number' ? (
              <button key={item} type="button" onClick={() => setCurrentPage(item)} className={`h-7 min-w-7 rounded-md px-1.5 text-[12px] font-medium transition ${currentPageForView === item ? 'bg-amber-400 text-slate-950' : 'text-slate-600 hover:bg-slate-100'}`}>{item}</button>
            ) : <span key={`ellipsis-${index}`} className="px-1 text-slate-400">…</span>))}
            <button type="button" onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPageForView === totalPages || totalPages === 1} className="inline-flex h-7 items-center rounded-md px-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      {formOpen ? (
        <Modal title={editing ? 'Edit transaction' : 'Add transaction'} subtitle="Keep the entry clear enough for later reconciliation and export." onClose={() => { if (!saving) setFormOpen(false); }}>
          <form onSubmit={submitForm} className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Transaction date *"><input type="date" value={form.transactionDate} onChange={(event) => updateForm('transactionDate', event.target.value)} className={inputClass} required /></Field>
              <Field label="Debit / Credit *"><SelectField value={form.type} onChange={(value) => updateForm('type', value)} options={[{ value: 'DEBIT', label: 'Debit / Expense' }, { value: 'CREDIT', label: 'Credit / Income' }]} /></Field>
              <Field label="Amount *"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} className={inputClass} placeholder="0.00" required /></Field>
              <Field label="Closing balance"><input type="number" step="0.01" value={form.balance} onChange={(event) => updateForm('balance', event.target.value)} className={inputClass} placeholder="Optional" /></Field>
              <Field label="Bank name *"><input value={form.accountName} onChange={(event) => updateForm('accountName', event.target.value)} className={`${inputClass} uppercase`} placeholder="HDFC BANK" required /></Field>
              <Field label="Name / party *"><input value={form.name} onChange={(event) => updateForm('name', event.target.value)} className={inputClass} placeholder="Vendor, customer or employee" required /></Field>
              <Field label="Category"><SelectField value={form.category} onChange={(value) => updateForm('category', value)} searchable options={categories.map((item) => ({ value: item, label: item }))} /></Field>
              <Field label="Payment method"><SelectField value={form.paymentMethod} onChange={(value) => updateForm('paymentMethod', value)} searchable options={paymentMethods} /></Field>
              <Field label="Invoice number"><input value={form.invoiceNumber} onChange={(event) => updateForm('invoiceNumber', event.target.value)} className={inputClass} /></Field>
              <Field label="Narration *" wide><textarea value={form.narration} onChange={(event) => updateForm('narration', event.target.value)} className={`${inputClass} min-h-16 resize-y`} placeholder="Why was this transaction made?" required /></Field>
              <Field label="UTR / reference"><input value={form.reference} onChange={(event) => updateForm('reference', event.target.value)} className={inputClass} /></Field>
              <Field label="Notes" wide><textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} className={`${inputClass} min-h-16 resize-y`} placeholder="Optional internal note" /></Field>
              <Field label="Cheque number"><input value={form.chequeNumber} onChange={(event) => updateForm('chequeNumber', event.target.value)} className={inputClass} /></Field>
            </div>
            <ModalFooter>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" busy={saving} icon={<Plus />}>{editing ? 'Update transaction' : 'Save transaction'}</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}

      {importOpen ? (
        <Modal wide title="Import bank statement" subtitle="CSV/TSV import supports date, narration, debit, credit, balance and reference columns." onClose={() => { if (!importing) setImportOpen(false); }}>
          <form onSubmit={submitImport} className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Bank name"><input value={importMeta.bankName} onChange={(event) => updateImportMeta('bankName', event.target.value)} className={`${inputClass} uppercase`} placeholder="HDFC BANK" /></Field>
              <Field label="Statement file *">
                <label className={`${inputClass} flex cursor-pointer items-center gap-2`}>
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-slate-600">{importFile?.name || 'Choose CSV / TSV file'}</span>
                  <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(event) => { void handleStatementFile(event.target.files?.[0]); event.target.value = ''; }} />
                </label>
              </Field>
              <Field label="Statement from"><input type="date" value={importMeta.statementFrom} onChange={(event) => updateImportMeta('statementFrom', event.target.value)} className={inputClass} /></Field>
              <Field label="Statement to"><input type="date" value={importMeta.statementTo} onChange={(event) => updateImportMeta('statementTo', event.target.value)} className={inputClass} /></Field>
              <Field label="Opening balance"><input type="number" step="0.01" value={importMeta.openingBalance} onChange={(event) => updateImportMeta('openingBalance', event.target.value)} className={inputClass} /></Field>
              <Field label="Closing balance"><input type="number" step="0.01" value={importMeta.closingBalance} onChange={(event) => updateImportMeta('closingBalance', event.target.value)} className={inputClass} /></Field>
            </div>
            {importError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{importError}</div> : null}
            {importRows.length ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                  <div><p className="text-[13px] font-semibold text-slate-900">Preview</p><p className="text-[12px] text-slate-500">{importRows.length} rows detected. Existing duplicate rows will be skipped.</p></div>
                  <Badge tone="green">Ready</Badge>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-[680px] text-left text-[12px]">
                    <thead className={tableHeadClass}><tr><th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Narration</th><th className="px-3 py-1.5 text-right font-medium">Debit</th><th className="px-3 py-1.5 text-right font-medium">Credit</th><th className="px-3 py-1.5 text-right font-medium">Balance</th><th className="px-3 py-1.5 font-medium">Reference</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.slice(0, 25).map((row, index) => (
                        <tr key={`${index}-${row.date || ''}`}>
                          <td className="whitespace-nowrap px-3 py-1.5">{importRowValue(row, ['date', 'valueDate']) || '—'}</td>
                          <td className="max-w-[260px] truncate px-3 py-1.5" title={importRowValue(row, ['narration'])}>{importRowValue(row, ['narration']) || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-red-700">{importRowValue(row, ['withdrawal', 'debit']) || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">{importRowValue(row, ['deposit', 'credit']) || '—'}</td>
                          <td className="px-3 py-1.5 text-right">{importRowValue(row, ['closing balance', 'balance', 'available balance']) || '—'}</td>
                          <td className="px-3 py-1.5">{importRowValue(row, ['reference']) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
                <Landmark className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-[13px] font-medium text-slate-700">Select a bank statement to preview it here</p>
                <p className="mt-0.5 text-[12px] text-slate-500">The first row must contain headings such as Date, Narration, Withdrawal, Deposit and Closing Balance.</p>
              </div>
            )}
            <ModalFooter>
              <Button onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
              <Button type="submit" variant="primary" busy={importing} disabled={!importRows.length} icon={<Upload />}>Import {importRows.length ? `${importRows.length} rows` : 'statement'}</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
