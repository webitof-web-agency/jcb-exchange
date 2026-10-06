import { createHash } from 'node:crypto';

export const FINANCE_TYPES = ['DEBIT', 'CREDIT'] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];

export const FINANCE_PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'NEFT',
  'RTGS',
  'IMPS',
  'BANK_TRANSFER',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'CHEQUE',
  'OTHER',
] as const;
export type FinancePaymentMethod = (typeof FINANCE_PAYMENT_METHODS)[number];

export type FinancePayload = {
  transactionDate: Date | null;
  valueDate: Date | null;
  type: FinanceType;
  amount: number;
  balance: number | null;
  accountName: string;
  paymentMethod: FinancePaymentMethod;
  name: string;
  category: string;
  narration: string;
  reference: string | null;
  chequeNumber: string | null;
  invoiceNumber: string | null;
  notes: string | null;
};

const stripControlCharacters = (value: string, allowNewlines = false) =>
  value.replace(allowNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');

const text = (value: unknown) =>
  typeof value === 'string' ? stripControlCharacters(value).replace(/\s+/g, ' ').trim() : '';

const multilineText = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return stripControlCharacters(value.replace(/\r/g, ''), true)
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const upperCode = (value: unknown, allowed: RegExp) => text(value).toUpperCase().replace(allowed, '');

const bankName = (value: unknown) => upperCode(value, /[^A-Z0-9&().,' -]/g);
const reference = (value: unknown) => upperCode(value, /[^A-Z0-9 _/-]/g);
const chequeNumber = (value: unknown) => upperCode(value, /[^A-Z0-9 /-]/g);
const invoiceNumber = (value: unknown) => upperCode(value, /[^A-Z0-9 /_.-]/g);

const hasNegativeAmount = (value: unknown) => {
  if (typeof value === 'number') return value < 0;
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/[\u20B9\u20AC\u00A3$\u00E2\u201A\u00B9,\s]/g, '').replace(/(?:CR|DR)$/i, '');
  return normalized.startsWith('-') || (normalized.startsWith('(') && normalized.endsWith(')'));
};

export const parseMoney = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
  const raw = text(value);
  if (!raw) return 0;

  const isParenthesized = raw.startsWith('(') && raw.endsWith(')');
  const normalized = raw
    .replace(/[\u20B9\u20AC\u00A3$\u00E2\u201A\u00B9,\s]/g, '')
    .replace(/(?:CR|DR)$/i, '')
    .replace(/[()]/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.abs(isParenthesized ? -amount : amount);
};

export const parseFinanceDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = text(value);
  if (!raw) return null;

  const dateOnly = raw.split(/[T\s]/)[0] || raw;
  const ymd = dateOnly.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const dmy = dateOnly.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const validType = (value: unknown): FinanceType =>
  FINANCE_TYPES.includes(String(value) as FinanceType) ? String(value) as FinanceType : 'DEBIT';

const validPaymentMethod = (value: unknown): FinancePaymentMethod =>
  FINANCE_PAYMENT_METHODS.includes(String(value) as FinancePaymentMethod)
    ? String(value) as FinancePaymentMethod
    : 'OTHER';

export const buildFinancePayload = (body: Record<string, unknown>, existing?: Partial<FinancePayload>): FinancePayload => {
  const value = (key: keyof FinancePayload) => body[key] !== undefined ? body[key] : existing?.[key];
  const type = validType(value('type'));
  const amount = hasNegativeAmount(value('amount')) ? -parseMoney(value('amount')) : parseMoney(value('amount'));

  return {
    transactionDate: parseFinanceDate(value('transactionDate')),
    valueDate: body.valueDate !== undefined ? parseFinanceDate(body.valueDate) : parseFinanceDate(existing?.valueDate),
    type,
    amount,
    balance: body.balance !== undefined
      ? text(body.balance) ? parseMoney(body.balance) : null
      : existing?.balance ?? null,
    accountName: bankName(value('accountName')),
    paymentMethod: validPaymentMethod(value('paymentMethod')),
    name: text(value('name')),
    category: text(value('category')) || 'Miscellaneous',
    narration: multilineText(value('narration')),
    reference: reference(value('reference')) || null,
    chequeNumber: chequeNumber(value('chequeNumber')) || null,
    invoiceNumber: invoiceNumber(value('invoiceNumber')) || null,
    notes: multilineText(value('notes')) || null,
  };
};

export const validateFinancePayload = (payload: FinancePayload) => {
  if (!payload.transactionDate) return 'Transaction date is required.';
  if (!FINANCE_TYPES.includes(payload.type)) return 'Transaction type is invalid.';
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return 'Amount must be greater than zero.';
  if (!payload.accountName) return 'Bank name is required.';
  if (payload.accountName.length > 100) return 'Bank name must not exceed 100 characters.';
  if (!payload.name) return 'Name is required.';
  if (payload.name.length > 120) return 'Name must not exceed 120 characters.';
  if (payload.category.length > 80) return 'Category must not exceed 80 characters.';
  if (!payload.narration) return 'Narration is required.';
  if (payload.narration.length > 1000) return 'Narration must not exceed 1000 characters.';
  if (payload.reference && payload.reference.length > 80) return 'UTR / reference must not exceed 80 characters.';
  if (payload.chequeNumber && payload.chequeNumber.length > 40) return 'Cheque number must not exceed 40 characters.';
  if (payload.invoiceNumber && payload.invoiceNumber.length > 60) return 'Invoice number must not exceed 60 characters.';
  if (payload.notes && payload.notes.length > 1000) return 'Notes must not exceed 1000 characters.';
  return null;
};

export type ImportedFinanceRow = Record<string, unknown>;

const firstValue = (row: ImportedFinanceRow, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  }
  return null;
};

const inferPaymentMethod = (value: unknown, narration: string): FinancePaymentMethod => {
  const supplied = text(value).toUpperCase().replace(/[ -]/g, '_');
  if (FINANCE_PAYMENT_METHODS.includes(supplied as FinancePaymentMethod)) return supplied as FinancePaymentMethod;
  const source = narration.toUpperCase();
  if (source.includes('UPI')) return 'UPI';
  if (source.includes('NEFT')) return 'NEFT';
  if (source.includes('RTGS')) return 'RTGS';
  if (source.includes('IMPS')) return 'IMPS';
  if (source.includes('CHEQUE') || source.includes('CHQ')) return 'CHEQUE';
  return 'OTHER';
};

export const parseImportedFinanceRow = (row: ImportedFinanceRow): FinancePayload => {
  const narration = text(firstValue(row, ['narration', 'description', 'particulars', 'remarks', 'transaction details']));
  const withdrawal = parseMoney(firstValue(row, ['withdrawal', 'debit', 'debit amount', 'withdrawal amount']));
  const deposit = parseMoney(firstValue(row, ['deposit', 'credit', 'credit amount', 'deposit amount']));

  if (withdrawal > 0 && deposit > 0) {
    throw new Error('A statement row cannot contain both debit and credit amounts.');
  }

  const type: FinanceType = withdrawal > 0 ? 'DEBIT' : deposit > 0 ? 'CREDIT' : 'DEBIT';
  const amount = withdrawal || deposit;
  const name = text(firstValue(row, ['name', 'payee', 'payer', 'beneficiary'])) || narration.slice(0, 120);

  return {
    transactionDate: parseFinanceDate(firstValue(row, ['date', 'transaction date', 'txn date', 'value date'])),
    valueDate: parseFinanceDate(firstValue(row, ['value date', 'posting date'])),
    type,
    amount,
    balance: firstValue(row, ['closing balance', 'closingBalance', 'balance', 'available balance']) === null
      ? null
      : parseMoney(firstValue(row, ['closing balance', 'closingBalance', 'balance', 'available balance'])),
    accountName: (text(firstValue(row, ['account', 'account name', 'bank account'])) || 'Imported bank account').toUpperCase(),
    paymentMethod: inferPaymentMethod(firstValue(row, ['method', 'mode', 'payment method']), narration),
    name,
    category: text(firstValue(row, ['category'])) || 'Imported / Uncategorized',
    narration,
    reference: text(firstValue(row, ['reference', 'utr', 'transaction reference', 'ref no', 'cheque/ref no'])) || null,
    chequeNumber: text(firstValue(row, ['cheque number', 'cheque no', 'chq no'])) || null,
    invoiceNumber: text(firstValue(row, ['invoice number', 'invoice no'])) || null,
    notes: null,
  };
};

export const createFinanceFingerprint = (input: {
  date: unknown;
  type: unknown;
  amount: unknown;
  reference?: unknown;
  narration?: unknown;
}) => {
  const date = parseFinanceDate(input.date)?.toISOString().slice(0, 10) || '';
  const content = [
    date,
    validType(input.type),
    parseMoney(input.amount).toFixed(2),
    text(input.reference).toLowerCase(),
    text(input.narration).toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
  return createHash('sha256').update(content).digest('hex');
};

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const summarizeFinanceTransactions = (transactions: Array<{ type: FinanceType; amount: number }>) => {
  const debit = transactions.filter((item) => item.type === 'DEBIT').reduce((sum, item) => sum + item.amount, 0);
  const credit = transactions.filter((item) => item.type === 'CREDIT').reduce((sum, item) => sum + item.amount, 0);
  return {
    debit: roundCents(debit),
    credit: roundCents(credit),
    net: roundCents(credit - debit),
  };
};
