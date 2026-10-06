import { NextFunction, Request, Response } from 'express';
import {
  FinanceImportStatus,
  FinancePaymentMethod,
  FinanceTransactionSource,
  FinanceTransactionStatus,
  FinanceTransactionType,
  Prisma,
} from '@prisma/client';
import prisma from '../lib/prisma';
import {
  buildFinancePayload,
  createFinanceFingerprint,
  FINANCE_PAYMENT_METHODS,
  FINANCE_TYPES,
  parseFinanceDate,
  parseImportedFinanceRow,
  summarizeFinanceTransactions,
  validateFinancePayload,
} from '../utils/finance';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const MAX_IMPORT_ROWS = 5000;

const serializeTransaction = (record: any) => ({
  ...record,
  amount: Number(record.amount),
  balance: record.balance === null || record.balance === undefined ? null : Number(record.balance),
  transactionDate: record.transactionDate instanceof Date ? record.transactionDate.toISOString() : record.transactionDate,
  valueDate: record.valueDate instanceof Date ? record.valueDate.toISOString() : record.valueDate,
});

const dateRange = (value: unknown, endOfDay = false) => {
  const date = parseFinanceDate(value);
  if (!date) return null;
  if (!endOfDay) return date;
  return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
};

const decimalOrNull = (value: number | null) => (value === null || !Number.isFinite(value) ? null : new Prisma.Decimal(value));

const transactionData = (payload: ReturnType<typeof buildFinancePayload>, userId: string, extra: Record<string, unknown> = {}) => ({
  transactionDate: payload.transactionDate as Date,
  valueDate: payload.valueDate,
  type: payload.type as FinanceTransactionType,
  amount: new Prisma.Decimal(payload.amount),
  balance: decimalOrNull(payload.balance),
  accountName: payload.accountName,
  paymentMethod: payload.paymentMethod as FinancePaymentMethod,
  name: payload.name,
  category: payload.category,
  narration: payload.narration,
  reference: payload.reference,
  chequeNumber: payload.chequeNumber,
  invoiceNumber: payload.invoiceNumber,
  notes: payload.notes,
  createdByUserId: userId,
  updatedByUserId: userId,
  ...extra,
});

export const listFinanceTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = text(req.query.q);
    const type = text(req.query.type);
    const paymentMethod = text(req.query.paymentMethod);
    const category = text(req.query.category);
    const accountName = text(req.query.accountName);
    const from = dateRange(req.query.from);
    const to = dateRange(req.query.to, true);
    const where: Prisma.FinanceTransactionWhereInput = {
      status: { not: FinanceTransactionStatus.VOIDED },
      ...(FINANCE_TYPES.includes(type as (typeof FINANCE_TYPES)[number]) ? { type: type as FinanceTransactionType } : {}),
      ...(FINANCE_PAYMENT_METHODS.includes(paymentMethod as (typeof FINANCE_PAYMENT_METHODS)[number])
        ? { paymentMethod: paymentMethod as FinancePaymentMethod }
        : {}),
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      ...(accountName ? { accountName: { equals: accountName, mode: 'insensitive' } } : {}),
      ...(from || to ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
              { narration: { contains: q, mode: 'insensitive' } },
              { reference: { contains: q, mode: 'insensitive' } },
              { accountName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const records = await prisma.financeTransaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 5000,
    });
    const transactions = records.map(serializeTransaction);

    return res.json({
      transactions,
      summary: summarizeFinanceTransactions(transactions),
      total: transactions.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getFinanceTransactionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Finance transaction id is required.' });

    const record = await prisma.financeTransaction.findFirst({
      where: { id, status: { not: FinanceTransactionStatus.VOIDED } },
    });
    if (!record) return res.status(404).json({ error: 'Finance transaction not found.' });

    return res.json({ transaction: serializeTransaction(record) });
  } catch (error) {
    next(error);
  }
};


export const listFinanceCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const records = await prisma.financeTransaction.findMany({
      where: { status: { not: FinanceTransactionStatus.VOIDED } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    const defaults = [
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
    const categories = Array.from(new Set([...defaults, ...records.map((item) => item.category)])).sort();
    return res.json({ categories });
  } catch (error) {
    next(error);
  }
};

export const createFinanceTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = buildFinancePayload(req.body || {});
    const validationError = validateFinancePayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const record = await prisma.financeTransaction.create({
      data: transactionData(payload, req.user!.id, {
        source: FinanceTransactionSource.MANUAL,
        status: FinanceTransactionStatus.POSTED,
      }),
    });

    return res.status(201).json({ transaction: serializeTransaction(record) });
  } catch (error) {
    next(error);
  }
};

export const updateFinanceTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Finance transaction id is required.' });

    const existing = await prisma.financeTransaction.findFirst({
      where: { id, status: { not: FinanceTransactionStatus.VOIDED } },
    });
    if (!existing) return res.status(404).json({ error: 'Finance transaction not found.' });

    const payload = buildFinancePayload(req.body || {}, {
      transactionDate: existing.transactionDate,
      valueDate: existing.valueDate,
      type: existing.type === FinanceTransactionType.CREDIT ? 'CREDIT' : 'DEBIT',
      amount: Number(existing.amount),
      balance: existing.balance === null ? null : Number(existing.balance),
      accountName: existing.accountName,
      paymentMethod: existing.paymentMethod,
      name: existing.name,
      category: existing.category,
      narration: existing.narration,
      reference: existing.reference,
      chequeNumber: existing.chequeNumber,
      invoiceNumber: existing.invoiceNumber,
      notes: existing.notes,
    });
    const validationError = validateFinancePayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const record = await prisma.financeTransaction.update({
      where: { id: existing.id },
      data: transactionData(payload, req.user!.id, {
        fingerprint: null,
      }),
    });

    return res.json({ transaction: serializeTransaction(record) });
  } catch (error) {
    next(error);
  }
};

export const deleteFinanceTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Finance transaction id is required.' });

    const existing = await prisma.financeTransaction.findFirst({
      where: { id, status: { not: FinanceTransactionStatus.VOIDED } },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Finance transaction not found.' });

    await prisma.financeTransaction.update({
      where: { id: existing.id },
      data: { status: FinanceTransactionStatus.VOIDED, updatedByUserId: req.user!.id },
    });
    return res.json({ message: 'Finance transaction deleted.' });
  } catch (error) {
    next(error);
  }
};

export const importFinanceTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const fileName = text(req.body?.fileName).slice(0, 255);
    if (!fileName) return res.status(400).json({ error: 'Statement file name is required.' });
    if (!rows.length) return res.status(400).json({ error: 'No statement rows were found.' });
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `You can import up to ${MAX_IMPORT_ROWS} rows at a time.` });
    }

    const importBatch = await prisma.financeImportBatch.create({
      data: {
        fileName,
        bankName: text(req.body?.bankName).toUpperCase() || null,
        accountName: text(req.body?.accountName).toUpperCase() || null,
        statementFrom: parseFinanceDate(req.body?.statementFrom),
        statementTo: parseFinanceDate(req.body?.statementTo),
        openingBalance: req.body?.openingBalance === '' || req.body?.openingBalance === undefined
          ? null
          : decimalOrNull(Number(req.body.openingBalance)),
        closingBalance: req.body?.closingBalance === '' || req.body?.closingBalance === undefined
          ? null
          : decimalOrNull(Number(req.body.closingBalance)),
        totalRows: rows.length,
        createdByUserId: req.user!.id,
      },
    });

    let importedRows = 0;
    let duplicateRows = 0;
    let failedRows = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] as Record<string, unknown>;
      try {
        const payload = parseImportedFinanceRow(row);
        const validationError = validateFinancePayload(payload);
        if (validationError) throw new Error(validationError);

        const fingerprint = createFinanceFingerprint({
          date: payload.transactionDate,
          type: payload.type,
          amount: payload.amount,
          reference: payload.reference,
          narration: payload.narration,
        });
        const duplicate = await prisma.financeTransaction.findUnique({ where: { fingerprint } });
        if (duplicate) {
          duplicateRows += 1;
          continue;
        }

        await prisma.financeTransaction.create({
          data: transactionData(payload, req.user!.id, {
            accountName: (text(req.body?.bankName) || text(req.body?.accountName) || payload.accountName).toUpperCase(),
            source: FinanceTransactionSource.IMPORT,
            status: FinanceTransactionStatus.POSTED,
            fingerprint,
            importBatchId: importBatch.id,
            rawData: row as Prisma.InputJsonValue,
          }),
        });
        importedRows += 1;
      } catch (error) {
        failedRows += 1;
        if (errors.length < 20) {
          errors.push({ row: index + 2, error: error instanceof Error ? error.message : 'Unable to import row.' });
        }
      }
    }

    const status = failedRows === 0
      ? FinanceImportStatus.COMPLETED
      : importedRows + duplicateRows > 0
        ? FinanceImportStatus.COMPLETED_WITH_ERRORS
        : FinanceImportStatus.FAILED;

    await prisma.financeImportBatch.update({
      where: { id: importBatch.id },
      data: { importedRows, duplicateRows, failedRows, status },
    });

    return res.status(201).json({
      importBatchId: importBatch.id,
      totalRows: rows.length,
      importedRows,
      duplicateRows,
      failedRows,
      errors,
      status,
    });
  } catch (error) {
    next(error);
  }
};
