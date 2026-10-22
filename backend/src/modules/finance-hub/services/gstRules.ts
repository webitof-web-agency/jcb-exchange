// GST rules (pure): GSTR-1 sections, input tax credit set-off order, GSTR-2B matching.

const round = (value: number) => Math.round(value * 100) / 100;

export type Tax = { igst: number; cgst: number; sgst: number };
export const totalTax = (tax: Tax) => round(tax.igst + tax.cgst + tax.sgst);

/** B2CL threshold for inter-state invoices to unregistered buyers (₹1,00,000 from Aug 2024). */
export const B2CL_LIMIT = 100000;

export const gstr1Section = (row: { gstin: string | null; isNote: boolean; interState: boolean; invoiceValue: number }) => {
  if (row.isNote) return row.gstin ? 'CDNR' : 'CDNUR';
  if (row.gstin) return 'B2B';
  return row.interState && Math.abs(row.invoiceValue) > B2CL_LIMIT ? 'B2CL' : 'B2CS';
};

/**
 * Section 49 / Rule 88A order: IGST credit first (IGST, then CGST, then SGST liability), then
 * CGST credit (CGST, then IGST) and SGST credit (SGST, then IGST). CGST and SGST never cross.
 */
export const setOff = (credit: Tax, liability: Tax) => {
  const left = { ...credit };
  const due = { ...liability };
  const uses: Array<{ from: keyof Tax; to: keyof Tax; amount: number }> = [];
  const use = (from: keyof Tax, to: keyof Tax) => {
    const amount = round(Math.min(left[from], due[to]));
    if (amount <= 0) return;
    left[from] = round(left[from] - amount);
    due[to] = round(due[to] - amount);
    uses.push({ from, to, amount });
  };
  use('igst', 'igst');
  use('igst', 'cgst');
  use('igst', 'sgst');
  use('cgst', 'cgst');
  use('cgst', 'igst');
  use('sgst', 'sgst');
  use('sgst', 'igst');
  return { uses, cashPayable: due, creditCarriedForward: left };
};

export type BookPurchase = { key: string; gstin: string; invoiceNo: string; date: string; taxable: number; tax: number };
export type PortalPurchase = { gstin: string; supplierName?: string | null | undefined; invoiceNo: string; date: string; taxable: number; igst: number; cgst: number; sgst: number };

const normInvoice = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
const normGstin = (value: string) => value.toUpperCase().replace(/\s/g, '');

/** Matches books with GSTR-2B by supplier GSTIN + invoice number; amounts within ₹1 count as equal. */
export const match2b = (books: BookPurchase[], portal: PortalPurchase[]) => {
  const remaining = new Map<string, BookPurchase[]>();
  for (const row of books) {
    const key = `${normGstin(row.gstin)}|${normInvoice(row.invoiceNo)}`;
    remaining.set(key, [...(remaining.get(key) ?? []), row]);
  }
  const results: Array<{ status: 'MATCHED' | 'AMOUNT_MISMATCH' | 'ONLY_IN_2B' | 'ONLY_IN_BOOKS'; gstin: string; invoiceNo: string; supplierName?: string | null | undefined; date: string; books: BookPurchase | null; portal: PortalPurchase | null; taxDifference: number }> = [];
  for (const row of portal) {
    const key = `${normGstin(row.gstin)}|${normInvoice(row.invoiceNo)}`;
    const candidates = remaining.get(key) ?? [];
    const book = candidates.shift();
    if (candidates.length) remaining.set(key, candidates);
    else remaining.delete(key);
    const portalTax = round(row.igst + row.cgst + row.sgst);
    if (!book) {
      results.push({ status: 'ONLY_IN_2B', gstin: row.gstin, invoiceNo: row.invoiceNo, supplierName: row.supplierName, date: row.date, books: null, portal: row, taxDifference: portalTax });
      continue;
    }
    const difference = round(portalTax - book.tax);
    const same = Math.abs(difference) <= 1 && Math.abs(row.taxable - book.taxable) <= 1;
    results.push({ status: same ? 'MATCHED' : 'AMOUNT_MISMATCH', gstin: row.gstin, invoiceNo: row.invoiceNo, supplierName: row.supplierName, date: row.date, books: book, portal: row, taxDifference: difference });
  }
  for (const rows of remaining.values()) for (const book of rows) results.push({ status: 'ONLY_IN_BOOKS', gstin: book.gstin, invoiceNo: book.invoiceNo, date: book.date, books: book, portal: null, taxDifference: round(-book.tax) });
  return results;
};

const portalDate = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};

/** Reads the B2B section of a GSTR-2B JSON downloaded from the GST portal. */
export const parse2bJson = (json: unknown): PortalPurchase[] => {
  const root = (json && typeof json === 'object' ? json : {}) as { data?: { docdata?: { b2b?: unknown[] } }; docdata?: { b2b?: unknown[] } };
  const suppliers = root.data?.docdata?.b2b ?? root.docdata?.b2b ?? [];
  const rows: PortalPurchase[] = [];
  for (const supplier of suppliers as Array<{ ctin?: string; trdnm?: string; inv?: Array<{ inum?: string; dt?: string; items?: Array<{ txval?: number; igst?: number; cgst?: number; sgst?: number }> }> }>) {
    for (const invoice of supplier.inv ?? []) {
      const items = invoice.items ?? [];
      const sum = (key: 'txval' | 'igst' | 'cgst' | 'sgst') => round(items.reduce((total, item) => total + Number(item[key] ?? 0), 0));
      rows.push({ gstin: supplier.ctin ?? '', supplierName: supplier.trdnm ?? null, invoiceNo: invoice.inum ?? '', date: portalDate(invoice.dt ?? ''), taxable: sum('txval'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst') });
    }
  }
  return rows.filter((row) => row.gstin && row.invoiceNo);
};
