export type FinanceExportRow = {
  id: string;
  transactionDate: string;
  valueDate: string | null;
  type: string;
  amount: number;
  balance: number | null;
  accountName: string;
  paymentMethod: string;
  name: string;
  category: string;
  narration: string;
  reference: string | null;
  chequeNumber: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  source: string;
};

export const getFinanceExportData = (row: FinanceExportRow) => ({
  transactionId: row.id,
  transactionDate: row.transactionDate,
  valueDate: row.valueDate || '',
  type: row.type,
  amount: row.amount,
  balance: row.balance ?? '',
  bankName: row.accountName,
  paymentMethod: row.paymentMethod,
  name: row.name,
  category: row.category,
  narration: row.narration,
  reference: row.reference || '',
  chequeNumber: row.chequeNumber || '',
  invoiceNumber: row.invoiceNumber || '',
  notes: row.notes || '',
  source: row.source,
});

export const filterFinanceExportRows = <T extends { transactionDate: string }>(rows: T[], from = '', to = '') =>
  rows.filter((row) => {
    const date = row.transactionDate.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
